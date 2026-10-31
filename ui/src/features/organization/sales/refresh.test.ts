import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import { refreshSales } from './refresh'

describe('sales refresh', () => {
  it('invalidates catalog insights alongside sales and client balances', async () => {
    const cache = new QueryClient()
    const affected = [
      '/api/v1/products/insights',
      '/api/v1/products/product-id/insights',
      '/api/v1/categories/insights',
      '/api/v1/categories/category-id/insights',
      '/api/v1/invoices',
      '/api/v1/clients/client-id/overview',
      '/api/v1/dashboard',
      '/api/v1/reports/analysis',
    ]
    for (const key of [...affected, '/api/v1/auth/session', '/api/v1/report-runs/saved'])
      cache.setQueryData([key], {})
    await refreshSales(cache)
    for (const key of affected) expect(cache.getQueryState([key])?.isInvalidated).toBe(true)
    expect(cache.getQueryState(['/api/v1/auth/session'])?.isInvalidated).toBe(false)
    expect(cache.getQueryState(['/api/v1/report-runs/saved'])?.isInvalidated).toBe(false)
    cache.clear()
  })
})
