import type { CoverageState } from './coverage.js'
import { GRACE_MS, RETENTION_MS } from './coverage.js'

export type PeriodInput = {
  kind: 'trial' | 'paid' | 'complimentary'
  planCode: string
  cycle: 'monthly' | 'annual' | null
  startsAt: Date
  endsAt: Date
  supersededAt: Date | null
}
export type SuspensionInput = { startedAt: Date; endedAt: Date | null }
export type ScheduledInput = { kind: string; effectiveAt: Date; status: string }
export type PeriodState = {
  periods: PeriodInput[]
  suspensions: SuspensionInput[]
  scheduled: ScheduledInput[]
}

const end = (p: PeriodInput) => p.supersededAt ?? p.endsAt

/**
 * Coverage from periods (S5). Mirrors resolveCoverage, with the S5 decisions: complimentary
 * coverage and a scheduled cancellation end without grace; an open suspension freezes every clock at
 * its start. Pure: callers pass the instant (database clock for decisions).
 */
export function resolvePeriods(state: PeriodState, now: Date): CoverageState {
  const open = state.suspensions.find((s) => !s.endedAt)
  if (!open) return running(state, now)
  const at = open.startedAt < now ? open.startedAt : now
  return { ...running(state, at), status: 'suspended' }
}

function running(state: PeriodState, now: Date): CoverageState {
  const empty = {
    cycle: null,
    current: null,
    paidThroughAt: null,
    graceEndsAt: null,
    nextPlanCode: null,
  }
  const trial = state.periods.find((p) => p.kind === 'trial')
  if (!state.periods.length)
    return {
      ...empty,
      status: 'not_started',
      planCode: 'trial',
      blockedAt: null,
      retentionEndsAt: null,
    }
  // Invariant: every started subscription has a trial period. Fail closed so shadow mode reports it.
  if (!trial)
    return { ...empty, status: 'expired', planCode: 'trial', blockedAt: now, retentionEndsAt: null }
  const t = now.getTime()
  const coverage = state.periods.filter((p) => p.kind !== 'trial')
  const current =
    coverage
      .filter((p) => p.startsAt.getTime() <= t && t < end(p).getTime())
      .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())[0] ?? null
  const paidThroughAt = coverage.length
    ? new Date(Math.max(...coverage.map((p) => end(p).getTime())))
    : null
  const next = coverage
    .filter((p) => p.startsAt.getTime() > t)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0]
  if (current)
    return {
      ...empty,
      status: 'active',
      planCode: current.planCode,
      cycle: current.cycle,
      current: {
        planCode: current.planCode,
        cycle: current.cycle,
        start: current.startsAt,
        end: end(current),
      },
      paidThroughAt,
      blockedAt: null,
      retentionEndsAt: null,
      nextPlanCode: next && next.planCode !== current.planCode ? next.planCode : null,
    }
  // Coverage that has not started yet (an administrator activation from a later day) never bridges
  // the gap after the trial: once the trial has ended the owner is expired until coverage starts.
  const started = coverage.some((p) => p.startsAt.getTime() <= t)
  if (!paidThroughAt || (!started && t >= trial.endsAt.getTime())) {
    const blocked = trial && t >= trial.endsAt.getTime() ? trial.endsAt : null
    return {
      ...empty,
      status: blocked ? 'expired' : 'trial',
      planCode: 'trial',
      blockedAt: blocked,
      retentionEndsAt: blocked && new Date(blocked.getTime() + RETENTION_MS),
    }
  }
  const last = coverage.reduce((a, b) =>
    end(b).getTime() > end(a).getTime() ||
    (end(b).getTime() === end(a).getTime() && b.startsAt >= a.startsAt)
      ? b
      : a,
  )
  const cancelled = state.scheduled.some((c) => c.kind === 'cancel' && c.status === 'scheduled')
  const graceEndsAt =
    cancelled || last.kind === 'complimentary' ? null : new Date(paidThroughAt.getTime() + GRACE_MS)
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

const fields = [
  'status',
  'planCode',
  'cycle',
  'paidThroughAt',
  'graceEndsAt',
  'blockedAt',
  'retentionEndsAt',
  'nextPlanCode',
] as const
const value = (v: unknown) => (v instanceof Date ? v.toISOString() : (v ?? null))

export type ShadowDiff = {
  ownerId: string
  at: string
  fields: { field: string; legacy: unknown; periods: unknown }[]
  /** Differences explained by an approved S5 decision rather than a defect. */
  expected: 'complimentary_no_grace' | null
}

/** Field-level comparison of the legacy and period resolvers (shadow mode). */
export function compareCoverage(
  ownerId: string,
  legacy: CoverageState,
  periods: CoverageState,
  lastKind: PeriodInput['kind'] | null,
  at: Date,
): ShadowDiff | null {
  const diffs = [...fields, 'current'].flatMap((field) => {
    const a =
      field === 'current'
        ? legacy.current &&
          [legacy.current.start.toISOString(), legacy.current.end.toISOString()].join()
        : value(legacy[field as (typeof fields)[number]])
    const b =
      field === 'current'
        ? periods.current &&
          [periods.current.start.toISOString(), periods.current.end.toISOString()].join()
        : value(periods[field as (typeof fields)[number]])
    return a === b ? [] : [{ field, legacy: a ?? null, periods: b ?? null }]
  })
  if (!diffs.length) return null
  const grace = new Set(['status', 'graceEndsAt', 'blockedAt', 'retentionEndsAt'])
  return {
    ownerId,
    at: at.toISOString(),
    fields: diffs,
    expected:
      lastKind === 'complimentary' && diffs.every((d) => grace.has(d.field))
        ? 'complimentary_no_grace'
        : null,
  }
}
