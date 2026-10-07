import type { QueryClient } from '@tanstack/react-query'

/** Financial changes refresh live queries; captured runs remain immutable. */
export const isLiveReportingPath = (path: unknown) =>
  typeof path === 'string' && ['/v1/dashboard', '/v1/reports/analysis'].includes(path)
export const refreshReporting = (cache: QueryClient) =>
  cache.invalidateQueries({
    predicate: ({ queryKey }) => isLiveReportingPath(queryKey[0]),
  })
