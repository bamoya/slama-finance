import { describe, expect, it } from 'vitest'

import { resolveCoverage } from '../src/modules/platform/subscriptions/services/coverage.js'
import {
  compareCoverage,
  type PeriodInput,
  type PeriodState,
  resolvePeriods,
} from '../src/modules/platform/subscriptions/services/period-resolver.service.js'

const DAY = 86_400_000
const d = (iso: string) => new Date(iso)
const trial: PeriodInput = {
  kind: 'trial',
  planCode: 'trial',
  cycle: null,
  startsAt: d('2026-01-01T00:00:00Z'),
  endsAt: d('2026-01-08T00:00:00Z'),
  supersededAt: null,
}
const paid = (over: Partial<PeriodInput> = {}): PeriodInput => ({
  kind: 'paid',
  planCode: 'essential',
  cycle: 'monthly',
  startsAt: d('2026-01-05T00:00:00Z'),
  endsAt: d('2026-02-05T00:00:00Z'),
  supersededAt: null,
  ...over,
})
const state = (periods: PeriodInput[], extra: Partial<PeriodState> = {}): PeriodState => ({
  periods,
  suspensions: [],
  scheduled: [],
  ...extra,
})
const at = (s: PeriodState, iso: string) => resolvePeriods(s, d(iso))

describe('period resolver', () => {
  it('fails closed when periods exist without a trial period (invariant violation)', () => {
    expect(at(state([paid()]), '2026-01-10T00:00:00Z')).toMatchObject({
      status: 'expired',
      blockedAt: d('2026-01-10T00:00:00Z'),
    })
  })

  it('is not started without periods and runs the trial to its exact end', () => {
    expect(at(state([]), '2026-01-01T00:00:00Z').status).toBe('not_started')
    expect(at(state([trial]), '2026-01-07T23:59:59.999Z').status).toBe('trial')
    const expired = at(state([trial]), '2026-01-08T00:00:00Z')
    expect(expired).toMatchObject({ status: 'expired', blockedAt: trial.endsAt })
    expect(expired.retentionEndsAt!.getTime()).toBe(trial.endsAt.getTime() + 90 * DAY)
  })

  it('uses half-open paid periods and a 7-day grace that ends exactly', () => {
    const s = state([trial, paid()])
    expect(at(s, '2026-01-05T00:00:00Z').status).toBe('active')
    expect(at(s, '2026-02-04T23:59:59.999Z').status).toBe('active')
    expect(at(s, '2026-02-05T00:00:00Z')).toMatchObject({
      status: 'past_due',
      graceEndsAt: d('2026-02-12T00:00:00Z'),
    })
    expect(at(s, '2026-02-12T00:00:00Z')).toMatchObject({
      status: 'expired',
      blockedAt: d('2026-02-12T00:00:00Z'),
    })
  })

  it('ends complimentary coverage and scheduled cancellations without grace', () => {
    const free = state([trial, paid({ kind: 'complimentary' })])
    expect(at(free, '2026-02-05T00:00:00Z')).toMatchObject({ status: 'expired', graceEndsAt: null })
    const cancelled = state([trial, paid()], {
      scheduled: [{ kind: 'cancel', effectiveAt: d('2026-02-05T00:00:00Z'), status: 'scheduled' }],
    })
    expect(at(cancelled, '2026-02-05T00:00:00Z').status).toBe('expired')
    // A cancelled (undone) cancellation restores the grace.
    const undone = state([trial, paid()], {
      scheduled: [{ kind: 'cancel', effectiveAt: d('2026-02-05T00:00:00Z'), status: 'cancelled' }],
    })
    expect(at(undone, '2026-02-05T00:00:00Z').status).toBe('past_due')
  })

  it('applies supersession at its instant and reports the next plan', () => {
    const upgrade = paid({ planCode: 'business', startsAt: d('2026-01-20T00:00:00Z') })
    const s = state([trial, paid({ supersededAt: upgrade.startsAt }), upgrade])
    expect(at(s, '2026-01-19T23:59:59.999Z').planCode).toBe('essential')
    expect(at(s, '2026-01-20T00:00:00Z').planCode).toBe('business')
    const renewal = paid({
      planCode: 'pro',
      startsAt: d('2026-02-05T00:00:00Z'),
      endsAt: d('2026-03-05T00:00:00Z'),
    })
    expect(at(state([trial, paid(), renewal]), '2026-01-10T00:00:00Z').nextPlanCode).toBe('pro')
  })

  it('freezes every clock at the suspension start, including grace', () => {
    const s = state([trial, paid()], {
      suspensions: [{ startedAt: d('2026-02-06T00:00:00Z'), endedAt: null }],
    })
    const frozen = at(s, '2026-05-01T00:00:00Z')
    expect(frozen).toMatchObject({ status: 'suspended', graceEndsAt: d('2026-02-12T00:00:00Z') })
    expect(frozen.blockedAt).toBeNull()
    // Ended suspensions no longer freeze.
    const resumed = state([trial, paid()], {
      suspensions: [{ startedAt: d('2026-01-10T00:00:00Z'), endedAt: d('2026-01-11T00:00:00Z') }],
    })
    expect(at(resumed, '2026-01-20T00:00:00Z').status).toBe('active')
  })

  it('matches the legacy resolver for paid coverage and classifies the complimentary grace change', () => {
    for (const iso of ['2026-01-06T00:00:00Z', '2026-02-05T00:00:00Z', '2026-02-12T00:00:00Z']) {
      const now = d(iso)
      const legacy = resolveCoverage(
        { trialEndsAt: trial.endsAt, cancelAtPeriodEnd: false, suspendedAt: null },
        [{ planCode: 'essential', cycle: 'monthly', start: paid().startsAt, end: paid().endsAt }],
        now,
      )
      expect(compareCoverage('o', legacy, at(state([trial, paid()]), iso), 'paid', now)).toBeNull()
      const free = compareCoverage(
        'o',
        legacy,
        at(state([trial, paid({ kind: 'complimentary' })]), iso),
        'complimentary',
        now,
      )
      if (free) expect(free.expected).toBe('complimentary_no_grace')
    }
  })
})
