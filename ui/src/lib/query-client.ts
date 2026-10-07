import { QueryClient } from '@tanstack/react-query'

import { shouldRetryQuery } from './api-error'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: shouldRetryQuery },
    mutations: { retry: false },
  },
})
