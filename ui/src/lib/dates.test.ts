import { describe, expect, it } from 'vitest'

import { displayDate, displayDateTime } from './dates'

describe('shared date display', () => {
  it('always displays day-month-year without shifting date-only values', () => {
    expect(displayDate('2026-10-23')).toBe('23-10-2026')
    expect(displayDate('2026-01-02')).toBe('02-01-2026')
    expect(displayDate(null)).toBe('—')
    expect(displayDate('')).toBe('—')
  })
  it('formats timestamps in the selected timezone and retains time', () => {
    expect(displayDateTime('2026-10-23T23:30:00Z', 'Africa/Casablanca')).toBe('24-10-2026 00:30')
    expect(displayDateTime('2026-10-23T23:30:00Z', 'UTC')).toBe('23-10-2026 23:30')
  })
})
