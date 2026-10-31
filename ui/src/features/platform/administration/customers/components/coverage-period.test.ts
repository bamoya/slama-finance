import { describe, expect, it } from 'vitest'

import { coverageEnd, localMidnight, todayIso } from './coverage-period'

describe('coverage period', () => {
  it('never places today in the future, even just after local midnight', () => {
    const justAfterMidnight = new Date(2026, 10, 1, 0, 30)
    const today = todayIso(justAfterMidnight)
    expect(today).toBe('2026-11-01')
    expect(new Date(localMidnight(today)).getTime()).toBeLessThanOrEqual(
      justAfterMidnight.getTime(),
    )
  })
  it('ends one month or one year later, clamped to the last day', () => {
    expect(coverageEnd('2026-01-31', 'monthly')).toBe('2026-02-28')
    expect(coverageEnd('2026-03-15', 'annual')).toBe('2027-03-15')
  })
})
