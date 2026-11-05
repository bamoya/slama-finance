import { describe, expect, it } from 'vitest'

import { displayDate, displayDateTime, rollingDateRange } from './dates'

describe('shared date display', () => {
  it('subtracts calendar months and clamps month ends including leap years', () => {
    expect(rollingDateRange(3, 'UTC', new Date('2026-11-05T12:00:00Z'))).toEqual({
      from: '2026-08-05',
      to: '2026-11-05',
    })
    expect(rollingDateRange(1, 'UTC', new Date('2026-03-31T12:00:00Z')).from).toBe('2026-02-28')
    expect(rollingDateRange(12, 'UTC', new Date('2024-02-29T12:00:00Z')).from).toBe('2023-02-28')
    expect(rollingDateRange(6, 'Etc/GMT-1', new Date('2026-11-05T23:30:00Z'))).toEqual({
      from: '2026-05-06',
      to: '2026-11-06',
    })
  })
  it('always displays day-month-year without shifting date-only values', () => {
    expect(displayDate('2026-10-23')).toBe('23-10-2026')
    expect(displayDate('2026-01-02')).toBe('02-01-2026')
    expect(displayDate(null)).toBe('—')
    expect(displayDate('')).toBe('—')
  })
  it('formats timestamps in the selected timezone and retains time', () => {
    // Fixed-offset zones keep this rollover check independent of future tzdata rules.
    expect(displayDateTime('2026-10-23T23:30:00Z', 'Etc/GMT-1')).toBe('24-10-2026 00:30')
    expect(displayDateTime('2026-10-23T23:30:00Z', 'UTC')).toBe('23-10-2026 23:30')
  })
  it('uses Casablanca by default and respects its historical timezone rules', () => {
    const instant = '2024-07-15T23:30:00Z'
    expect(displayDateTime(instant, 'Africa/Casablanca')).toBe('16-07-2024 00:30')
    expect(displayDateTime(instant)).toBe(displayDateTime(instant, 'Africa/Casablanca'))
  })
})
