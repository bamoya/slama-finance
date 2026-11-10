import type {
  EntitlementSource,
  OwnerSubscription,
  SubscriptionEntitlements,
} from '../../../../contracts/generated/subscriptions/subscriptions.schemas.js'
import type { Transaction } from '../../../../lib/db.js'
import { AppError } from '../../../../lib/errors.js'
import type { createSubscriptionRepository } from '../repositories/subscription.repository.js'
import type { createBillingService } from './billing.service.js'
import { billingMonth } from './billing-calendar.service.js'
import type { createCatalogReader } from './catalog-values.service.js'
import { effectiveEntitlements, overrideEnd } from './effective-entitlements.js'

type SubscriptionRepository = ReturnType<typeof createSubscriptionRepository>
type CoverageSnapshot = Awaited<ReturnType<SubscriptionRepository['periodState']>>
export type BillingState = Awaited<ReturnType<ReturnType<typeof createBillingService>['state']>>

/** One resolution: every rule below is evaluated at `at` against one coverage/override snapshot. */
export type AccessResolution = {
  at: Date
  state: BillingState
  /** Independent restriction reported before plan values; gates deny on it whatever the values say. */
  restriction: 'subscription_suspended' | null
  planCode: string
  planName: string
  planVersionId: string
  planVersionNumber: number
  entitlements: SubscriptionEntitlements
  sources: EntitlementSource[]
  accessValidUntil: Date | null
  scheduledVersionTransition: OwnerSubscription['scheduledVersionTransition']
}

export const coverageUnavailable = () =>
  new AppError(
    503,
    'SUBSCRIPTION_PERIODS_INCONSISTENT',
    'Subscription coverage is temporarily unavailable. Please try again later.',
  )

/**
 * Earliest instant after `at` at which the resolution may change without a write: coverage starts
 * and ends, trial end, grace end, scheduled changes, override starts/ends and (paid plans) the next
 * email month. An open suspension freezes coverage, so only override boundaries remain. Instants
 * equal to or before `at` are already reflected and ignored.
 */
export function accessDeadline(
  at: Date,
  state: BillingState,
  snapshot: CoverageSnapshot,
): Date | null {
  const instants: (Date | null | undefined)[] = []
  if (state.status !== 'suspended') {
    for (const c of state.coverage) instants.push(c.start, c.end)
    instants.push(state.row?.trialEndsAt, state.graceEndsAt, state.paidThroughAt)
    for (const c of snapshot.scheduled) if (c.status === 'scheduled') instants.push(c.effectiveAt)
    if (state.planCode !== 'trial' && state.status !== 'expired')
      instants.push(billingMonth(at).end)
  }
  for (const o of snapshot.overrides) instants.push(o.startsAt, overrideEnd(o))
  const t = at.getTime()
  const future = instants.filter((d): d is Date => !!d && d.getTime() > t)
  return future.length ? new Date(Math.min(...future.map((d) => d.getTime()))) : null
}

/**
 * The single effective-access resolver for API admissions, workers, the owner summary and the
 * workspace. Production reads the instant from the database transaction clock; an injected clock
 * replaces it for every rule. Coverage, overrides, the selling pointer and restrictions are never
 * cached; only immutable published version terms are (inside the catalog reader). Fails closed:
 * an unreadable pin or version is a 503, never JSON values, another version or unlimited access.
 */
export function createAccessResolver(deps: {
  repo: SubscriptionRepository
  state: (
    ownerId: string,
    tx: Transaction,
    at: Date,
    from: undefined,
    snapshot: CoverageSnapshot,
  ) => Promise<BillingState>
  catalog: ReturnType<typeof createCatalogReader>
  clock?: () => Date
}) {
  const { repo, catalog } = deps
  return async function resolveAccess(ownerId: string, tx: Transaction): Promise<AccessResolution> {
    const at = deps.clock ? deps.clock() : await repo.now(tx)
    const snapshot = await repo.periodState(ownerId, tx)
    const state = await deps.state(ownerId, tx, at, undefined, snapshot)
    const versionId =
      state.status === 'not_started'
        ? null
        : state.planCode === 'trial'
          ? state.row?.trialPlanVersionId
          : state.planVersionId
    // The legacy paid-through marker has no pin: never infer a version for it.
    if (versionId === undefined || (versionId === null && state.status !== 'not_started'))
      throw coverageUnavailable()
    const terms = versionId
      ? await catalog.pinned(versionId, tx)
      : await catalog.selling('trial', tx)
    if (terms.planCode !== state.planCode) throw coverageUnavailable()
    const effective = effectiveEntitlements(terms.entitlements, snapshot.overrides, at)
    const transition = snapshot.scheduled.find(
      (c) => c.kind === 'version_transition' && c.status === 'scheduled',
    )
    return {
      at,
      state,
      restriction: state.status === 'suspended' ? 'subscription_suspended' : null,
      planCode: terms.planCode,
      planName: terms.name,
      planVersionId: terms.versionId,
      planVersionNumber: terms.versionNumber,
      entitlements: effective.entitlements,
      sources: effective.sources,
      accessValidUntil: accessDeadline(at, state, snapshot),
      scheduledVersionTransition:
        transition?.targetPlanVersionId && transition.noticeSentAt
          ? {
              targetVersionNumber: (await catalog.pinned(transition.targetPlanVersionId, tx))
                .versionNumber,
              effectiveAt: transition.effectiveAt.toISOString(),
              noticeSentAt: transition.noticeSentAt.toISOString(),
            }
          : null,
    }
  }
}
