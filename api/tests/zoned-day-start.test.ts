import { describe, expect, it } from 'vitest'

import { companyDate } from '../src/lib/validation.js'
import { zonedDayStart } from '../src/modules/platform/subscriptions/index.js'

describe('zonedDayStart', () => {
  it('rejects impossible or malformed days with a 400 instead of rolling over', () => {
    for (const day of ['2026-02-30', '2026-13-01', 'tomorrow', '2026-2-3', ''])
      expect(() => zonedDayStart(day), day).toThrow(
        expect.objectContaining({ statusCode: 400, code: 'VALIDATION_ERROR' }),
      )
  })

  it('accepts real days, including a leap day', () => {
    const start = zonedDayStart('2028-02-29')
    expect(companyDate(start)).toBe('2028-02-29')
    expect(companyDate(new Date(start.getTime() - 1))).toBe('2028-02-28')
  })
})
