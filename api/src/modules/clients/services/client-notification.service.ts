import {
  type ClientNotificationPreferenceInput,
  ClientNotificationPreferenceInputSchema,
} from '../../../contracts/generated/clients/notification-preferences.schemas.js'
import type { NotificationRule } from '../../../contracts/generated/settings/notifications.schemas.js'
import type { Transaction } from '../../../lib/db.js'
import { AppError } from '../../../lib/errors.js'
import type { NotificationPolicyPublicApi } from '../../settings/index.js'
import type { createClientNotificationRepository } from '../repositories/client-notification.repository.js'

export function clientNotificationEligibility(
  ruleEnabled: boolean,
  overrideEnabled: boolean | null,
  email: string | null,
  archived: boolean,
) {
  if (!ruleEnabled) return 'RULE_DISABLED'
  if (overrideEnabled === false) return 'CLIENT_OPT_OUT'
  if (archived) return 'CLIENT_ARCHIVED'
  if (!email || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return 'MISSING_EMAIL'
  return null
}
export function createClientNotificationService(
  repo: ReturnType<typeof createClientNotificationRepository>,
  policies: NotificationPolicyPublicApi,
  onChange?: (tx: Transaction, clientId: string) => Promise<void>,
) {
  async function effective(id: string, rule: NotificationRule, tx?: Transaction) {
    const client = await repo.client(id, tx)
    const override = await repo.preference(id, rule.id, tx)
    const reason = clientNotificationEligibility(
      rule.enabled,
      override?.enabled ?? null,
      client.email,
      !!client.archivedAt,
    )
    return {
      clientId: id,
      recipient: client.email,
      cc: override?.cc ?? [],
      clientName:
        client.type === 'company'
          ? (client.legalName ?? '')
          : `${client.firstName ?? ''} ${client.lastName ?? ''}`.trim(),
      enabled: reason === null,
      reason,
    }
  }
  async function item(id: string, rule: NotificationRule, tx?: Transaction) {
    const recipient = await effective(id, rule, tx)
    const override = await repo.preference(id, rule.id, tx)
    return {
      ruleId: rule.id,
      eventKey: rule.eventKey,
      globalEnabled: rule.enabled,
      overrideEnabled: override?.enabled ?? null,
      cc: override?.cc ?? [],
      version: override?.version ?? 0,
      effectiveEnabled: recipient.enabled,
      reason: recipient.reason,
      recipient: recipient.recipient,
    }
  }
  async function assert(tx: Transaction, actor: string, action: string) {
    await repo.authorize(tx, actor, 'clients.read')
    await repo.authorize(tx, actor, `client_notification_preferences.${action}`)
  }
  return {
    publicApi: { effective },
    list(id: string, actor: string) {
      return repo.transaction(async (tx) => {
        await assert(tx, actor, 'read')
        await repo.client(id, tx)
        return {
          items: await Promise.all((await policies.rules(tx)).map((rule) => item(id, rule, tx))),
        }
      })
    },
    upsert(id: string, ruleId: string, input: ClientNotificationPreferenceInput, actor: string) {
      const data = ClientNotificationPreferenceInputSchema.parse(input)
      const cc = data.cc.map((v) => v.trim().toLowerCase())
      if (new Set(cc).size !== cc.length)
        throw new AppError(400, 'INVALID_CC', 'CC recipients must be unique.')
      return repo.transaction(async (tx) => {
        await assert(tx, actor, 'update')
        await repo.client(id, tx, true)
        const rule = (await policies.rules(tx)).find((r) => r.id === ruleId)
        if (!rule)
          throw new AppError(404, 'NOTIFICATION_RULE_NOT_FOUND', 'Notification rule not found.')
        const before = await repo.preference(id, ruleId, tx)
        if ((before?.version ?? 0) !== data.expectedVersion)
          throw new AppError(409, 'STALE_VERSION', 'This preference changed. Reload before saving.')
        await repo.upsert(id, ruleId, { enabled: data.enabled, cc }, actor, tx)
        await onChange?.(tx, id)
        await repo.audit(tx, actor, id, 'notification_preference_update', null, {
          ruleId,
          enabled: data.enabled,
        })
        return item(id, rule, tx)
      })
    },
    remove(id: string, ruleId: string, version: number, actor: string) {
      return repo.transaction(async (tx) => {
        await assert(tx, actor, 'update')
        await repo.client(id, tx, true)
        const before = await repo.preference(id, ruleId, tx)
        if (!before) throw new AppError(404, 'PREFERENCE_NOT_FOUND', 'No override exists.')
        if (before.version !== version)
          throw new AppError(
            409,
            'STALE_VERSION',
            'This preference changed. Reload before resetting.',
          )
        await repo.remove(id, ruleId, tx)
        await onChange?.(tx, id)
        await repo.audit(tx, actor, id, 'notification_preference_reset', null, { ruleId })
      })
    },
  }
}
