import type { OwnerSubscription } from '../../../../contracts/generated/subscriptions/subscriptions.schemas.js'
import type { Transaction } from '../../../../lib/db.js'
import { AppError } from '../../../../lib/errors.js'
import { currentOrganizationId } from '../../../../lib/tenant-database.js'
import type { createSubscriptionRepository } from '../repositories/subscription.repository.js'
export function createSubscriptionService(
  repo: ReturnType<typeof createSubscriptionRepository>,
  clock = () => new Date(),
) {
  async function summary(ownerId: string, tx: Transaction): Promise<OwnerSubscription> {
    const row = await repo.subscription(ownerId, tx),
      plan = row?.subscription_plans ?? (await repo.trial(tx)),
      subscription = row?.owner_subscriptions
    const now = clock().getTime(),
      paid = subscription?.paidThroughAt?.getTime()
    const status = !subscription
      ? 'not_started'
      : subscription.planCode === 'trial'
        ? now < subscription.trialEndsAt.getTime()
          ? 'trial'
          : 'expired'
        : paid && now < paid
          ? 'active'
          : paid && now < paid + 7 * 86400000
            ? 'past_due'
            : 'expired'
    const period =
      subscription?.planCode === 'trial'
        ? {
            start: subscription.trialStartedAt.toISOString(),
            end: subscription.trialEndsAt.toISOString(),
          }
        : subscription
          ? await repo.month(clock(), tx)
          : { start: null, end: null }
    return {
      usage: await repo.usage(
        ownerId,
        period.start,
        period.end,
        period.start ? `${plan.code === 'trial' ? 'trial' : 'month'}:${period.start}` : null,
        tx,
      ),
      planCode: plan.code as OwnerSubscription['planCode'],
      planName: plan.name,
      status,
      trialEndsAt: subscription?.trialEndsAt.toISOString() ?? null,
      paidThroughAt: subscription?.paidThroughAt?.toISOString() ?? null,
      entitlements: plan.entitlements,
      organizationCount: await repo.organizationCount(ownerId, tx),
    }
  }
  const available = (s: OwnerSubscription) => {
    if (s.status === 'expired')
      throw new AppError(
        402,
        'SUBSCRIPTION_EXPIRED',
        'Your subscription has expired. Manage it from your owner portal.',
      )
  }
  async function current(tx: Transaction) {
    const owner = await repo.ownerForOrganization(tx)
    if (!owner) throw new AppError(403, 'FORBIDDEN', 'Organization not found.')
    return repo.ownerScope(owner, tx, () => summary(owner, tx))
  }
  return {
    async reserveStorage(key: string, byteSize: number, sha256: string) {
      const match = /^organizations\/([a-f0-9-]{36})\/(?:media|branding|artifacts)\//i.exec(key)
      if (!match || !Number.isSafeInteger(byteSize) || byteSize <= 0)
        throw new AppError(400, 'INVALID_STORAGE_KEY', 'Invalid organization object.')
      return repo.storageOrganization(match[1]!, async (tx) => {
        const owner = await repo.ownerForOrganization(tx)
        if (!owner) throw new AppError(403, 'FORBIDDEN', 'Organization not found.')
        await repo.lock(owner, tx)
        return repo.ownerScope(owner, tx, async () => {
          const existing = await repo.storage(key, tx)
          if (existing) {
            if (existing.byteSize !== byteSize || existing.sha256 !== sha256)
              throw new AppError(
                409,
                'STORAGE_CONFLICT',
                'The object already has different content.',
              )
            await repo.touchStorage(key, tx)
            return
          }
          const s = await summary(owner, tx)
          available(s)
          if (s.usage.storageBytes + byteSize > s.entitlements.storageBytes)
            throw new AppError(
              409,
              'STORAGE_LIMIT',
              'Your storage allowance has been reached. Remove unused files or upgrade your plan.',
            )
          await repo.reserveStorage({ objectKey: key, ownerId: owner, byteSize, sha256 }, tx)
        })
      })
    },
    async confirmStorage(key: string) {
      const match = /^organizations\/([a-f0-9-]{36})\//i.exec(key)
      if (!match) throw new AppError(400, 'INVALID_STORAGE_KEY', 'Invalid organization object.')
      return repo.storageOrganization(match[1]!, async (tx) => {
        const owner = await repo.ownerForOrganization(tx)
        if (!owner) throw new AppError(403, 'FORBIDDEN', 'Organization not found.')
        return repo.ownerScope(owner, tx, () => repo.confirmStorage(key, tx))
      })
    },
    async cleanupReservations(list?: (prefix: string) => Promise<{ key: string }[]>) {
      const organizationId = currentOrganizationId()
      if (!organizationId || !list) return
      const stale = await repo.storageOrganization(organizationId, async (tx) => {
        const owner = await repo.ownerForOrganization(tx)
        if (!owner) return []
        return repo.ownerScope(owner, tx, () => repo.staleStorage(owner, organizationId, tx))
      })
      if (!stale.length) return
      const prefixes = [
        ...new Set(stale.map((row) => row.objectKey.split('/').slice(0, 3).join('/') + '/')),
      ]
      const present = new Set(
        (await Promise.all(prefixes.map((prefix) => list(prefix)))).flat().map((file) => file.key),
      )
      for (const row of stale)
        if (!present.has(row.objectKey))
          await repo.storageOrganization(organizationId, async (tx) => {
            await repo.lock(row.ownerId, tx)
            await repo.ownerScope(row.ownerId, tx, () =>
              repo.releaseStaleStorage(row.objectKey, row.version, tx),
            )
          })
    },
    async releaseStorage(key: string) {
      const match = /^organizations\/([a-f0-9-]{36})\//i.exec(key)
      if (!match) throw new AppError(400, 'INVALID_STORAGE_KEY', 'Invalid organization object.')
      return repo.storageOrganization(match[1]!, async (tx) => {
        const owner = await repo.ownerForOrganization(tx)
        if (!owner) throw new AppError(403, 'FORBIDDEN', 'Organization not found.')
        await repo.lock(owner, tx)
        return repo.ownerScope(owner, tx, () => repo.releaseStorage(key, tx))
      })
    },
    async reserveEmail(tx: Transaction, messageKey: string, recipients: number) {
      const owner = await repo.ownerForOrganization(tx)
      if (!owner) throw new AppError(403, 'FORBIDDEN', 'Organization not found.')
      await repo.lock(owner, tx)
      return repo.ownerScope(owner, tx, async () => {
        if (await repo.email(messageKey, tx)) return
        const s = await summary(owner, tx)
        available(s)
        if (!s.entitlements.features.includes('business_emails'))
          throw new AppError(
            403,
            'FEATURE_UNAVAILABLE',
            'Business emails are not included in your plan.',
          )
        if (s.usage.businessEmails + recipients > s.entitlements.businessEmails)
          throw new AppError(409, 'EMAIL_LIMIT', 'Your business email allowance has been reached.')
        await repo.reserveEmail(
          {
            ownerId: owner,
            messageKey,
            recipients,
            allowanceKey: `${s.planCode === 'trial' ? 'trial' : 'month'}:${s.usage.emailPeriodStart}`,
            queuedAt: clock(),
          },
          tx,
        )
      })
    },
    summary: (id: string) => repo.owner(id, (tx) => summary(id, tx)),
    async admitOrganization(ownerId: string, tx: Transaction) {
      await repo.lock(ownerId, tx)
      let s = await summary(ownerId, tx)
      available(s)
      if (
        s.entitlements.organizations !== null &&
        s.organizationCount >= s.entitlements.organizations
      )
        throw new AppError(
          409,
          'ORGANIZATION_LIMIT',
          'Your plan organization limit has been reached.',
        )
      if (s.status === 'not_started') {
        await repo.start(ownerId, tx)
        s = await summary(ownerId, tx)
      }
      return s
    },
    async assertAccess(tx: Transaction) {
      const s = await current(tx)
      available(s)
      return s
    },
    async admitStaff(tx: Transaction, additional = 1) {
      const id = await repo.ownerForOrganization(tx)
      if (!id) throw new AppError(403, 'FORBIDDEN', 'Organization not found.')
      await repo.lock(id, tx)
      const s = await current(tx)
      available(s)
      if (
        s.entitlements.staffPerOrganization !== null &&
        (await repo.staffCount(tx)) + additional > s.entitlements.staffPerOrganization
      )
        throw new AppError(409, 'STAFF_LIMIT', 'Your plan staff limit has been reached.')
    },
    async feature(tx: Transaction, feature: OwnerSubscription['entitlements']['features'][number]) {
      const s = await current(tx)
      available(s)
      if (!s.entitlements.features.includes(feature))
        throw new AppError(403, 'FEATURE_UNAVAILABLE', 'This feature is not included in your plan.')
    },
  }
}
