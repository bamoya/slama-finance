import type { QueryClient } from '@tanstack/react-query'

import * as api from '../../api/generated/clients/clients'

export const useClients = (params?: Parameters<typeof api.listClients>[0], enabled = true) =>
  api.useListClients(params, { query: { enabled } })
export const useClient = (id: string, enabled = true) =>
  api.useGetClient(id, { query: { enabled } })
export const useClientOverview = (id: string, enabled = true) =>
  api.useGetClientOverview(id, { query: { enabled } })
export const refreshClients = (client: QueryClient) =>
  client.invalidateQueries({
    predicate: ({ queryKey }) => {
      const path = queryKey[0]
      return (
        typeof path === 'string' &&
        ['/v1/clients', '/v1/invoices', '/v1/estimates', '/v1/delivery-notes', '/v1/payments'].some(
          (prefix) => path.startsWith(prefix),
        )
      )
    },
  })
export function useClientActions() {
  const create = api.useCreateClient()
  const update = api.useUpdateClient()
  const archive = api.useArchiveClient()
  const restore = api.useRestoreClient()
  const remove = api.useDeleteClient()
  return {
    create: (data: Parameters<typeof api.createClient>[0]) => create.mutateAsync({ data }),
    update: (id: string, data: Parameters<typeof api.updateClient>[1]) =>
      update.mutateAsync({ id, data }),
    archive: (id: string, expectedVersion: number) =>
      archive.mutateAsync({ id, data: { expectedVersion } }),
    restore: (id: string, expectedVersion: number) =>
      restore.mutateAsync({ id, data: { expectedVersion } }),
    delete: (id: string, expectedVersion: number) =>
      remove.mutateAsync({ id, data: { expectedVersion } }),
  }
}
