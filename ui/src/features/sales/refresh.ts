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
            '/v1/clients',
            '/v1/estimates',
            '/v1/invoices',
            '/v1/delivery-notes',
            '/v1/payments',
            '/v1/products',
            '/v1/categories',
          ].some((path) => key.startsWith(path)))
      )
    },
  })
