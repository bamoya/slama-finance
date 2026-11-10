import type {
  AdminEntitlementOverride,
  AdminEntitlementOverrideCreate,
} from '../../../../../contracts/generated/administration/administration.schemas.js'
import type { Transaction } from '../../../../../lib/db.js'
import { AppError, databaseCode } from '../../../../../lib/errors.js'
import { billingDay, billingTimezone, zonedDayStart } from '../../../subscriptions/index.js'
import type { AdminAuditService } from '../../audit/services/admin-audit.service.js'
import type { AdminTransaction } from '../../shared/repositories/admin-transaction.repository.js'
import type { AuthenticatedAdmin } from '../../shared/types/authenticated-admin.js'
import type {
  createOverrideRepository,
  OverrideRecord,
} from '../repositories/override.repository.js'

/**
 * Owner subscriptions span organizations and have no timezone setting of their own, so calendar
 * days are interpreted in the platform default zone (organization settings use the same default).
 */
const timezone = billingTimezone

/** Stored notes are trimmed; a blank reason is a validation error, never a database 500. */
function reasonOf(value: string) {
  const reason = value.trim()
  if (!reason)
    throw new AppError(400, 'VALIDATION_ERROR', 'Indicate the reason for this action.', {
      reason: ['Indicate the reason for this action.'],
    })
  return reason
}

const notFound = () => new AppError(404, 'NOT_FOUND', 'Override not found.')
const invalid = (message: string) => new AppError(400, 'OVERRIDE_VALUE_INVALID', message)

function stateOf(o: OverrideRecord, now: Date): AdminEntitlementOverride['state'] {
  if (o.revokedAt) return 'revoked'
  if (o.startsAt > now) return 'scheduled'
  return o.endsAt && o.endsAt <= now ? 'ended' : 'active'
}

const view = (o: OverrideRecord, now: Date): AdminEntitlementOverride => ({
  id: o.id,
  entitlementKey: o.entitlementKey as AdminEntitlementOverride['entitlementKey'],
  booleanValue: o.booleanValue,
  integerValue: o.integerValue,
  unlimited: o.isUnlimited,
  startsAt: o.startsAt.toISOString(),
  endsAt: o.endsAt?.toISOString() ?? null,
  reason: o.reason,
  createdBy: o.createdByEmail,
  createdAt: o.createdAt.toISOString(),
  revokedAt: o.revokedAt?.toISOString() ?? null,
  revokedBy: o.revokedByEmail,
  revocationReason: o.revocationReason,
  replacesId: o.replacesId,
  state: stateOf(o, now),
  timezone,
})

/** Audit snapshot: values and window only; the reason is the action's own field. */
const auditValue = (o: OverrideRecord) => ({
  id: o.id,
  entitlementKey: o.entitlementKey,
  booleanValue: o.booleanValue,
  integerValue: o.integerValue,
  unlimited: o.isUnlimited,
  startsAt: o.startsAt.toISOString(),
  endsAt: o.endsAt?.toISOString() ?? null,
  revokedAt: o.revokedAt?.toISOString() ?? null,
})

/** Owner-subscription overrides. Administrator session, reason and same-transaction audit. */
export function createOverrideService(options: {
  repo: ReturnType<typeof createOverrideRepository>
  audit: AdminAuditService
  withAdmin: AdminTransaction
  /** Throws 503 while application and database zone data disagree or are unverified. */
  writable?: () => void
}) {
  const { repo, audit, withAdmin } = options
  const writable = options.writable ?? (() => {})

  async function validate(input: AdminEntitlementOverrideCreate, tx: Transaction) {
    const definition = await repo.definition(input.entitlementKey, tx)
    if (!definition) throw invalid('Unknown entitlement.')
    if (definition.valueType === 'boolean') {
      if (typeof input.booleanValue !== 'boolean' || input.integerValue !== null || input.unlimited)
        throw invalid('A feature override is enabled or disabled.')
      return { valueType: 'boolean' as const, booleanValue: input.booleanValue }
    }
    if (input.booleanValue !== null) throw invalid('This limit takes a number.')
    if (input.unlimited) {
      if (!definition.unlimitedAllowed || input.integerValue !== null)
        throw invalid('This limit cannot be unlimited.')
      return { valueType: 'integer' as const, isUnlimited: true }
    }
    const min = input.entitlementKey === 'organizations' ? 1 : 0
    if (!Number.isSafeInteger(input.integerValue) || input.integerValue! < min)
      throw invalid(`Enter a whole number of at least ${min}.`)
    return { valueType: 'integer' as const, integerValue: input.integerValue! }
  }

  async function revokeLocked(
    admin: AuthenticatedAdmin,
    ownerId: string,
    id: string,
    reason: string,
    now: Date,
    tx: Transaction,
    code: string,
  ) {
    const before = await repo.byId(id, tx, true)
    if (!before || before.ownerId !== ownerId) throw notFound()
    if (before.revokedAt || (before.endsAt && before.endsAt <= now))
      throw new AppError(
        409,
        code,
        'This override has already ended or been revoked; its history is kept.',
      )
    await repo.revoke(id, { revokedAt: now, revokedBy: admin.id, revocationReason: reason }, tx)
    const after = (await repo.byId(id, tx))!
    await audit.record(
      {
        adminId: admin.id,
        actor: admin.email,
        action: 'subscription_override.revoke',
        targetType: 'owner',
        targetId: ownerId,
        before: auditValue(before),
        after: { ...auditValue(after), reason },
      },
      tx,
    )
    return after
  }

  return {
    list: (ownerId: string) =>
      withAdmin(async (tx) => {
        if (!(await repo.ownerExists(ownerId, tx)))
          throw new AppError(404, 'NOT_FOUND', 'Customer not found.')
        const now = await repo.now(tx)
        return { items: (await repo.list(ownerId, tx)).map((o) => view(o, now)) }
      }),

    create: (admin: AuthenticatedAdmin, ownerId: string, input: AdminEntitlementOverrideCreate) =>
      withAdmin(async (tx) => {
        const reason = reasonOf(input.reason)
        // Calendar days need the zone data; an immediate open-ended override does not.
        if (input.startsOn || input.endsOn) writable()
        if (!(await repo.ownerExists(ownerId, tx)))
          throw new AppError(404, 'NOT_FOUND', 'Customer not found.')
        const now = await repo.now(tx)
        const value = await validate(input, tx)
        // Calendar days in the customer zone; storage is UTC. Absent or today starts now.
        const today = billingDay(now, timezone)
        if (input.startsOn && input.startsOn < today)
          throw new AppError(
            400,
            'OVERRIDE_START_IN_PAST',
            'An override cannot start in the past; past enforcement is not rewritten.',
          )
        const startsAt =
          input.startsOn && input.startsOn > today ? zonedDayStart(input.startsOn, timezone) : now
        const endsAt = input.endsOn ? zonedDayStart(input.endsOn, timezone) : null
        if (endsAt && endsAt <= startsAt) throw invalid('The end must be after the start.')
        if (input.replacesId) {
          const replaced = await repo.byId(input.replacesId, tx, true)
          if (!replaced || replaced.ownerId !== ownerId) throw notFound()
          if (replaced.entitlementKey !== input.entitlementKey)
            throw new AppError(
              409,
              'OVERRIDE_NOT_REPLACEABLE',
              'An amendment must keep the same entitlement.',
            )
          // Amending an applied override takes effect now; a later start would leave a plan-value gap.
          if (replaced.startsAt <= now && startsAt > now)
            throw new AppError(
              409,
              'OVERRIDE_AMENDMENT_START',
              'An amendment of an active override starts immediately. Schedule a separate override instead.',
            )
          await revokeLocked(
            admin,
            ownerId,
            replaced.id,
            reason,
            now,
            tx,
            'OVERRIDE_NOT_REPLACEABLE',
          )
        }
        let id: string
        try {
          ;({ id } = await repo.insert(
            {
              ownerId,
              entitlementKey: input.entitlementKey,
              ...value,
              startsAt,
              endsAt,
              replacesId: input.replacesId ?? null,
            },
            { reason, createdBy: admin.id },
            tx,
          ))
        } catch (error) {
          if (databaseCode(error) === '23P01')
            throw new AppError(
              409,
              'OVERRIDE_OVERLAP',
              'Another override of this entitlement covers part of this period. Revoke or amend it first.',
            )
          throw error
        }
        const created = (await repo.byId(id, tx))!
        await audit.record(
          {
            adminId: admin.id,
            actor: admin.email,
            action: 'subscription_override.create',
            targetType: 'owner',
            targetId: ownerId,
            before: null,
            after: { ...auditValue(created), replacesId: created.replacesId, reason },
          },
          tx,
        )
        return view(created, now)
      }),

    revoke: (admin: AuthenticatedAdmin, ownerId: string, id: string, input: { reason: string }) =>
      withAdmin(async (tx) => {
        const reason = reasonOf(input.reason)
        const now = await repo.now(tx)
        const revoked = await revokeLocked(
          admin,
          ownerId,
          id,
          reason,
          now,
          tx,
          'OVERRIDE_NOT_REVOCABLE',
        )
        return view(revoked, now)
      }),
  }
}
