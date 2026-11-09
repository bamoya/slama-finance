import type { OwnerSubscription } from '../../../../contracts/generated/subscriptions/subscriptions.schemas.js'
import type { Transaction } from '../../../../lib/db.js'
import { AppError } from '../../../../lib/errors.js'
import { currentOrganizationId } from '../../../../lib/tenant-database.js'
import type { createBillingRepository } from '../repositories/billing.repository.js'
import type { CoverageReads } from '../repositories/coverage-lifecycle.repository.js'
import type { createSubscriptionRepository } from '../repositories/subscription.repository.js'
import { createBillingService, toPayment } from './billing.service.js'
import { billingMonth, billingMonthKey } from './billing-calendar.service.js'
import { effectiveEntitlements } from './effective-entitlements.js'
import { compareCoverage, resolvePeriods, type ShadowDiff } from './period-resolver.service.js'
/** Never discloses which restriction applies; the organization domain shows a static page. */
const SHADOW_LOG_KEYS = 1000
const unavailable = () =>
  new AppError(403, 'ORGANIZATION_SUSPENDED', 'This organization is temporarily unavailable.')

export function createSubscriptionService(
  repo: ReturnType<typeof createSubscriptionRepository>,
  billingRepo: ReturnType<typeof createBillingRepository>,
  clock = () => new Date(),
  writable: () => void = () => {},
  onShadowDiff: (diff: ShadowDiff) => void = () => {},
  periodWrites = true,
  reads: CoverageReads = 'legacy',
) {
  /**
   * Shadow mode: the non-authoritative resolver runs beside the selected one on every summary and
   * only records differences (legacy reads: periods in shadow; period reads: legacy in shadow). It
   * never changes a response or fails a request; `failed` counts shadow reads that could not compare.
   */
  const shadow = { compared: 0, failed: 0, differing: 0, unexpected: 0, recent: [] as ShadowDiff[] }
  const logged = new Set<string>()
  async function compareShadow(
    ownerId: string,
    selected: Awaited<ReturnType<typeof billing.state>>,
    at: Date,
    tx: Transaction,
  ) {
    try {
      // Savepoint: a failed shadow read must not abort the caller's transaction.
      const diff =
        reads === 'periods'
          ? compareCoverage(
              ownerId,
              await tx.transaction((sp) => billing.state(ownerId, sp, at, 'legacy')),
              selected,
              selected.lastKind,
              at,
            )
          : await tx.transaction(async (sp) => {
              const state = await repo.periodState(ownerId, sp)
              const coverage = state.periods.filter((p) => p.kind !== 'trial')
              const last = coverage.reduce<(typeof coverage)[number] | null>(
                (a, b) =>
                  !a || (b.supersededAt ?? b.endsAt) >= (a.supersededAt ?? a.endsAt) ? b : a,
                null,
              )
              return compareCoverage(
                ownerId,
                selected,
                resolvePeriods(state, at),
                last?.kind ?? null,
                at,
              )
            })
      shadow.compared++
      if (!diff) return
      shadow.differing++
      if (!diff.expected) shadow.unexpected++
      shadow.recent = [diff, ...shadow.recent].slice(0, 20)
      // Log each distinct difference once per owner (bounded LRU); counters keep the rest.
      const key = `${ownerId}:${JSON.stringify(diff.fields.map((f) => [f.field, f.legacy, f.periods]))}`
      if (logged.has(key)) {
        logged.delete(key)
        logged.add(key)
        return
      }
      logged.add(key)
      if (logged.size > SHADOW_LOG_KEYS) logged.delete(logged.values().next().value!)
      onShadowDiff(diff)
    } catch {
      // Shadow mode is diagnostic only; zero differences mean nothing without zero failures.
      shadow.failed++
    }
  }
  const billing = {
    ...createBillingService(billingRepo, repo, clock, writable, periodWrites, reads),
    plan: billingRepo.plan,
    payments: billingRepo.payments,
  }
  /** Trial: one pool keyed by the trial start. Paid: the local calendar month (stable key). */
  const allowanceOf = (planCode: string, start: string | null) =>
    !start
      ? null
      : planCode === 'trial'
        ? { trial: `trial:${start}` }
        : { month: billingMonthKey(clock()) }
  const allowanceKey = (planCode: string, start: string | null) => {
    const a = allowanceOf(planCode, start)
    return !a ? null : 'trial' in a ? a.trial : `month:${a.month}`
  }
  async function summary(ownerId: string, tx: Transaction): Promise<OwnerSubscription> {
    const at = clock()
    const s = await billing.state(ownerId, tx, at),
      subscription = s.row
    const plan = (await billing.plan(s.planCode, tx)) ?? (await repo.trial(tx)),
      pending = (await billing.payments(ownerId, tx)).find((p) => p.status === 'submitted')
    const period =
      s.planCode === 'trial'
        ? subscription
          ? {
              start: subscription.trialStartedAt.toISOString(),
              end: subscription.trialEndsAt.toISOString(),
            }
          : { start: null, end: null }
        : (({ start, end }) => ({ start: start.toISOString(), end: end.toISOString() }))(
            billingMonth(clock()),
          )
    await compareShadow(ownerId, s, at, tx)
    const iso = (d: Date | null) => d?.toISOString() ?? null
    const overrides = await repo.overrides(ownerId, tx)
    // Server-authored windows are evaluated on the database clock (read only when needed).
    const effective = effectiveEntitlements(
      plan.entitlements,
      overrides,
      overrides.length ? await repo.now(tx) : clock(),
    )
    return {
      usage: await repo.usage(
        ownerId,
        period.start,
        period.end,
        allowanceOf(plan.code, period.start),
        tx,
      ),
      planCode: plan.code as OwnerSubscription['planCode'],
      planName: plan.name,
      status: s.status,
      trialEndsAt: iso(subscription?.trialEndsAt ?? null),
      paidThroughAt: iso(s.paidThroughAt),
      cycle: s.cycle,
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      graceEndsAt: iso(s.graceEndsAt),
      blockedAt: iso(s.blockedAt),
      retentionEndsAt: iso(s.retentionEndsAt),
      nextPlanCode: s.nextPlanCode as OwnerSubscription['nextPlanCode'],
      pendingPayment: pending ? toPayment(pending) : null,
      entitlements: effective.entitlements,
      organizationCount: await repo.organizationCount(ownerId, tx),
      entitlementSources: effective.sources,
    }
  }
  const available = (s: OwnerSubscription) => {
    if (s.status === 'suspended') throw unavailable()
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
    if (await repo.organizationRestricted(tx)) throw unavailable()
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
            allowanceKey: allowanceKey(s.planCode, s.usage.emailPeriodStart)!,
            queuedAt: clock(),
          },
          tx,
        )
      })
    },
    summary: (id: string) => repo.owner(id, (tx) => summary(id, tx)),
    /** Shadow-mode counters and the latest differences (S5a diagnostics; not used for decisions). */
    coverageShadow: () => ({ ...shadow, recent: [...shadow.recent] }),
    /** Period-based coverage at the database clock (S5a: exposed, not yet used for decisions). */
    resolvePeriods: (id: string) =>
      repo.owner(id, async (tx) =>
        resolvePeriods(await repo.periodState(id, tx), await repo.now(tx)),
      ),
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
    /**
     * Worker eligibility for the current organization: same restrictions and selected coverage
     * authority as API admissions, without throwing. Featureless jobs need a started, available
     * subscription; feature jobs also need the effective feature (overrides included).
     */
    async workerEligible(
      tx: Transaction,
      feature?: OwnerSubscription['entitlements']['features'][number],
    ) {
      try {
        const s = await current(tx)
        available(s)
        if (s.status === 'not_started') return false
        return !feature || s.entitlements.features.includes(feature)
      } catch (error) {
        if (error instanceof AppError) return false
        throw error
      }
    },
    async hasFeature(
      tx: Transaction,
      feature: OwnerSubscription['entitlements']['features'][number],
    ) {
      try {
        const s = await current(tx)
        available(s)
        return s.entitlements.features.includes(feature)
      } catch (error) {
        if (error instanceof AppError) return false
        throw error
      }
    },
    async feature(tx: Transaction, feature: OwnerSubscription['entitlements']['features'][number]) {
      const s = await current(tx)
      available(s)
      if (!s.entitlements.features.includes(feature))
        throw new AppError(403, 'FEATURE_UNAVAILABLE', 'This feature is not included in your plan.')
    },
  }
}
