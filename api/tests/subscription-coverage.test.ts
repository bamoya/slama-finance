import { describe, expect, it } from 'vitest'

import {
  money,
  prorate,
  resolveCoverage,
} from '../src/modules/platform/subscriptions/services/coverage.js'

const d = (s: string) => new Date(s)
const trial = (cancel = false) => ({
  trialEndsAt: d('2026-06-08T10:00:00Z'),
  cancelAtPeriodEnd: cancel,
})
const may = {
  planCode: 'business',
  cycle: 'monthly' as const,
  start: d('2026-05-01T00:00:00Z'),
  end: d('2026-06-01T00:00:00Z'),
}

describe('subscription coverage', () => {
  it('ends the trial at the exact timestamp with no grace, weekends included', () => {
    expect(resolveCoverage(trial(), [], d('2026-06-08T09:59:59.999Z')).status).toBe('trial')
    const expired = resolveCoverage(trial(), [], d('2026-06-08T10:00:00Z'))
    expect(expired).toMatchObject({ status: 'expired', graceEndsAt: null })
    expect(expired.retentionEndsAt).toEqual(d('2026-09-06T10:00:00Z'))
  })
  it('gives previously paid coverage exactly seven days of grace', () => {
    expect(resolveCoverage(trial(), [may], d('2026-05-31T23:59:59Z')).status).toBe('active')
    const grace = resolveCoverage(trial(), [may], d('2026-06-01T00:00:00Z'))
    expect(grace).toMatchObject({ status: 'past_due', planCode: 'business' })
    expect(grace.graceEndsAt).toEqual(d('2026-06-08T00:00:00Z'))
    const blocked = resolveCoverage(trial(), [may], d('2026-06-08T00:00:00Z'))
    expect(blocked).toMatchObject({ status: 'expired', blockedAt: d('2026-06-08T00:00:00Z') })
  })
  it('keeps paid coverage after cancellation and skips grace afterwards', () => {
    expect(resolveCoverage(trial(true), [may], d('2026-05-20T00:00:00Z')).status).toBe('active')
    const ended = resolveCoverage(trial(true), [may], d('2026-06-01T00:00:00Z'))
    expect(ended).toMatchObject({ status: 'expired', blockedAt: may.end, graceEndsAt: null })
  })
  it('applies an upgrade immediately and a downgrade only at renewal', () => {
    const upgrade = { ...may, planCode: 'pro', start: d('2026-05-15T00:00:00Z') }
    expect(resolveCoverage(trial(), [may, upgrade], d('2026-05-20T00:00:00Z')).planCode).toBe('pro')
    const june = { ...may, planCode: 'essential', start: may.end, end: d('2026-07-01T00:00:00Z') }
    const before = resolveCoverage(trial(), [may, june], d('2026-05-20T00:00:00Z'))
    expect(before).toMatchObject({ planCode: 'business', nextPlanCode: 'essential' })
    expect(resolveCoverage(trial(), [may, june], d('2026-06-01T00:00:00Z')).planCode).toBe(
      'essential',
    )
  })
  it('snapshots HT, tax and TTC in centimes', () => {
    expect(money(29900, 2000, 'MAD')).toEqual({
      currency: 'MAD',
      amountHt: 29900,
      taxRateBasisPoints: 2000,
      taxAmount: 5980,
      amountTtc: 35880,
    })
    expect(money(799000, null, 'MAD')).toMatchObject({ taxAmount: 0, amountTtc: 799000 })
  })
  it('prorates the price difference over the unused period', () => {
    expect(prorate(50000, may, d('2026-05-16T12:00:00Z'))).toBe(25000)
    expect(prorate(50000, may, d('2026-06-02T00:00:00Z'))).toBe(0)
  })
})
