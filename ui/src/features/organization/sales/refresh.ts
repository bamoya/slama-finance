import type { QueryClient } from '@tanstack/react-query'

import { isLiveReportingPath } from '../reports'

/** Sales mutations can change document relationships and client financial summaries. */
export const refreshSales = (client: QueryClient) =>
  client.invalidateQueries({
    predicate: ({ queryKey }) => {
      const key = queryKey[0]
      return (
        typeof key === 'string' &&
        (isLiveReportingPath(key) ||
          [
            '/api/v1/clients',
            '/api/v1/credit-notes',
            '/api/v1/estimates',
            '/api/v1/invoices',
            '/api/v1/delivery-notes',
            '/api/v1/payments',
            '/api/v1/products',
            '/api/v1/categories',
          ].some((path) => key.startsWith(path)))
      )
    },
  })
