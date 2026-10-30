import { describe, expect, it } from 'vitest'

import { displayNumber, numberFormatter } from './number-format'

describe('number formatting', () => {
  it('groups every three digits without losing decimal precision', () => {
    expect(displayNumber('123')).toBe('123')
    expect(displayNumber('1234')).toBe('1\u00a0234')
    expect(displayNumber('-1234567890123456789.90', 'fr-MA')).toBe(
      '-1\u00a0234\u00a0567\u00a0890\u00a0123\u00a0456\u00a0789,90',
    )
    expect(displayNumber('12345.678', 'fr-MA')).toBe('12\u00a0345,678')
    expect(displayNumber('1234567.89 MAD', 'fr-MA')).toBe('1\u00a0234\u00a0567,89 MAD')
    expect(displayNumber('1234.50', 'en-GB')).toBe('1\u00a0234.50')
    expect(displayNumber('0.00', 'fr-MA')).toBe('0,00')
  })
  it('uses spaces in French and English and preserves formatter precision', () => {
    expect(numberFormatter('en-GB', { minimumFractionDigits: 2 }).format(1234567.5)).toBe(
      '1\u00a0234\u00a0567.50',
    )
    expect(numberFormatter('fr-MA', { maximumFractionDigits: 3 }).format(12345.678)).toBe(
      '12\u00a0345,678',
    )
    expect(numberFormatter('en-GB').format(1234567890123456789n)).toBe(
      '1\u00a0234\u00a0567\u00a0890\u00a0123\u00a0456\u00a0789',
    )
  })
  it('leaves nonnumeric text unchanged', () => {
    for (const value of ['FAC-2026-123456', '2026-10-30', '+212612345678', '—', ''])
      expect(displayNumber(value)).toBe(value)
  })
})
