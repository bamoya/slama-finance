import { describe, expect, it } from 'vitest'

import { resolveCatalogPeriod } from '../src/modules/catalog/services/catalog-insights.service.js'

describe('catalog insight periods', () => {
  const now = new Date('2026-10-01T00:30:00.000Z')
  it('uses the company timezone at month and year boundaries', () => {
    expect(
      resolveCatalogPeriod(
        { period: 'this_month' },
        { companyCurrency: 'MAD', companyTimezone: 'Pacific/Honolulu' },
        now,
      ),
    ).toEqual({ currency: 'MAD', dateFrom: '2026-09-01', dateTo: '2026-09-30' })
    expect(
      resolveCatalogPeriod(
        { period: 'this_month' },
        { companyCurrency: 'MAD', companyTimezone: 'Africa/Casablanca' },
        now,
      ),
    ).toEqual({ currency: 'MAD', dateFrom: '2026-10-01', dateTo: '2026-10-31' })
    expect(
      resolveCatalogPeriod(
        { period: 'last_month' },
        { companyCurrency: 'MAD', companyTimezone: 'Africa/Casablanca' },
        now,
      ),
    ).toEqual({ currency: 'MAD', dateFrom: '2026-09-01', dateTo: '2026-09-30' })
  })
  it('honors explicit currency and custom dates without a timezone shift', () => {
    expect(
      resolveCatalogPeriod(
        { period: 'custom', currency: 'EUR', dateFrom: '2026-09-15', dateTo: '2026-09-20' },
        { companyCurrency: 'MAD', companyTimezone: 'Africa/Casablanca' },
        now,
      ),
    ).toEqual({ currency: 'EUR', dateFrom: '2026-09-15', dateTo: '2026-09-20' })
  })
})
