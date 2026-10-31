import { useQueryClient } from '@tanstack/react-query'

const refreshed = [
  '/v1/admin/owners',
  '/v1/admin/payments',
  '/v1/admin/overview',
  '/v1/admin/audit',
]

/** Lifecycle actions change a customer, the lists that show it and the overview counts. */
export function useRefreshAdministration() {
  const client = useQueryClient()
  return () =>
    client.invalidateQueries({
      predicate: ({ queryKey }) =>
        typeof queryKey[0] === 'string' &&
        refreshed.some((prefix) => String(queryKey[0]).startsWith(prefix)),
    })
}
