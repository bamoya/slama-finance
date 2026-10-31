import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import { refreshSales } from './refresh'

describe('sales refresh', () => {
  it('invalidates catalog insights alongside sales and client balances', async () => {
    const cache = new QueryClient()
    const affected = [
      '/v1/products/insights',
      '/v1/products/product-id/insights',
      '/v1/categories/insights',
      '/v1/categories/category-id/insights',
      '/v1/invoices',
      '/v1/clients/client-id/overview',
      '/v1/dashboard',
      '/v1/reports/analysis',
    ]
    for (const key of [...affected, '/v1/auth/session', '/v1/report-runs/saved'])
      cache.setQueryData([key], {})
    await refreshSales(cache)
    for (const key of affected) expect(cache.getQueryState([key])?.isInvalidated).toBe(true)
    expect(cache.getQueryState(['/v1/auth/session'])?.isInvalidated).toBe(false)
    expect(cache.getQueryState(['/v1/report-runs/saved'])?.isInvalidated).toBe(false)
    cache.clear()
  })
})
