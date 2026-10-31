import { QueryClient } from '@tanstack/react-query'
import { expect, it } from 'vitest'

import { refreshReporting } from './refresh'

it('refreshes live data while preserving captured reports and schedule configuration', async () => {
  const cache = new QueryClient()
  const keys = [
    '/v1/dashboard',
    '/v1/reports/analysis',
    '/v1/report-runs/id',
    '/v1/report-schedules',
  ]
  for (const key of keys) cache.setQueryData([key, { currency: 'MAD' }], {})
  await refreshReporting(cache)
  expect(keys.map((key) => cache.getQueryState([key, { currency: 'MAD' }])?.isInvalidated)).toEqual(
    [true, true, false, false],
  )
  cache.clear()
})
