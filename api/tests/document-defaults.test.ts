import { expect, it } from 'vitest'

import { documentDefaultDate } from '../src/modules/sales/shared/services/document-defaults.js'

it('adds company calendar-day defaults across months, years and leap days', () => {
  expect(documentDefaultDate('2026-12-31', 15)).toBe('2027-01-15')
  expect(documentDefaultDate('2028-02-28', 1)).toBe('2028-02-29')
  expect(documentDefaultDate('2026-10-13', 0)).toBe('2026-10-13')
})
