export const GRACE_MS = 7 * 86_400_000
export const RETENTION_MS = 90 * 86_400_000

export type Cycle = 'monthly' | 'annual'
export type Coverage = { planCode: string; cycle: Cycle | null; start: Date; end: Date }
export type CoverageState = {
  status: 'not_started' | 'trial' | 'active' | 'past_due' | 'expired'
  planCode: string
  cycle: Cycle | null
  current: Coverage | null
  paidThroughAt: Date | null
  graceEndsAt: Date | null
  blockedAt: Date | null
  retentionEndsAt: Date | null
  nextPlanCode: string | null
}

/**
 * Derives lifecycle from confirmed coverage. Trials never get grace; cancellation ends access at
 * the paid boundary. Later-starting coverage wins on overlap so confirmed upgrades take effect.
 */
export function resolveCoverage(
  subscription: { trialEndsAt: Date; cancelAtPeriodEnd: boolean } | null,
  coverage: Coverage[],
  now: Date,
): CoverageState {
  const empty = {
    cycle: null,
    current: null,
    paidThroughAt: null,
    graceEndsAt: null,
    nextPlanCode: null,
  }
  if (!subscription)
    return {
      ...empty,
      status: 'not_started',
      planCode: 'trial',
      blockedAt: null,
      retentionEndsAt: null,
    }
  const t = now.getTime()
  const current =
    coverage
      .filter((c) => c.start.getTime() <= t && t < c.end.getTime())
      .sort((a, b) => b.start.getTime() - a.start.getTime())[0] ?? null
  const paidThroughAt = coverage.length
    ? new Date(Math.max(...coverage.map((c) => c.end.getTime())))
    : null
  const next = coverage
    .filter((c) => c.start.getTime() > t)
    .sort((a, b) => a.start.getTime() - b.start.getTime())[0]
  if (current)
    return {
      ...empty,
      status: 'active',
      planCode: current.planCode,
      cycle: current.cycle,
      current,
      paidThroughAt,
      blockedAt: null,
      retentionEndsAt: null,
      nextPlanCode: next && next.planCode !== current.planCode ? next.planCode : null,
    }
  if (!paidThroughAt) {
    const blocked = t >= subscription.trialEndsAt.getTime() ? subscription.trialEndsAt : null
    return {
      ...empty,
      status: blocked ? 'expired' : 'trial',
      planCode: 'trial',
      blockedAt: blocked,
      retentionEndsAt: blocked && new Date(blocked.getTime() + RETENTION_MS),
    }
  }
  const last = coverage.reduce((a, b) => (b.end.getTime() >= a.end.getTime() ? b : a))
  const graceEndsAt = subscription.cancelAtPeriodEnd
    ? null
    : new Date(paidThroughAt.getTime() + GRACE_MS)
  const blockedAt = graceEndsAt ?? paidThroughAt
  const expired = t >= blockedAt.getTime()
  return {
    status: expired ? 'expired' : 'past_due',
    planCode: last.planCode,
    cycle: last.cycle,
    current: null,
    paidThroughAt,
    graceEndsAt,
    blockedAt: expired ? blockedAt : null,
    retentionEndsAt: expired ? new Date(blockedAt.getTime() + RETENTION_MS) : null,
    nextPlanCode: null,
  }
}

/** Integer centimes; tax rounds half-up per document. */
export function money(amountHt: number, taxRateBasisPoints: number | null, currency: string) {
  const taxAmount = taxRateBasisPoints ? Math.round((amountHt * taxRateBasisPoints) / 10_000) : 0
  return { currency, amountHt, taxRateBasisPoints, taxAmount, amountTtc: amountHt + taxAmount }
}

/** Upgrade charge: price difference for the unused share of the current period, to the centime. */
export function prorate(difference: number, current: Coverage, now: Date) {
  const total = current.end.getTime() - current.start.getTime()
  const remaining = Math.max(0, current.end.getTime() - now.getTime())
  return Math.round((difference * remaining) / total)
}
