import type { QueryClient } from '@tanstack/react-query'

import * as api from '../../../api/generated/sales/sales'
import { refreshSales } from '../refresh'

export const useDeliveryNotes = (
  params?: Parameters<typeof api.listDeliveryNotes>[0],
  enabled = true,
) => api.useListDeliveryNotes(params, { query: { enabled } })
export const useDeliveryNote = (id: string, enabled = true) =>
  api.useGetDeliveryNote(id, { query: { enabled } })
export const useDeliveryArtifacts = (id: string, enabled = true) =>
  api.useListDeliveryNoteArtifacts(id, {
    query: { enabled, refetchInterval: (query) => (query.state.data?.length ? false : 2000) },
  })
export const refreshDeliveries = (client: QueryClient) => refreshSales(client)

export function useDeliveryActions() {
  const create = api.useCreateDeliveryNote()
  const update = api.useUpdateDeliveryNote()
  const remove = api.useDeleteDeliveryNote()
  const prepare = api.usePrepareDeliveryNote()
  const deliver = api.useDeliverDeliveryNote()
  const acknowledge = api.useAcknowledgeDeliveryNote()
  const cancel = api.useCancelDeliveryNote()
  const pdf = api.usePrepareDeliveryNotePdf()
  return {
    create: (data: Parameters<typeof api.createDeliveryNote>[0]) => create.mutateAsync({ data }),
    update: (id: string, data: Parameters<typeof api.updateDeliveryNote>[1]) =>
      update.mutateAsync({ id, data }),
    delete: (id: string, expectedVersion: number) =>
      remove.mutateAsync({ id, data: { expectedVersion } }),
    prepare: (id: string, expectedVersion: number) =>
      prepare.mutateAsync({ id, data: { expectedVersion } }),
    deliver: (id: string, expectedVersion: number) =>
      deliver.mutateAsync({ id, data: { expectedVersion } }),
    acknowledge: (id: string, expectedVersion: number, receivedByName: string) =>
      acknowledge.mutateAsync({ id, data: { expectedVersion, receivedByName } }),
    cancel: (id: string, expectedVersion: number, reason: string) =>
      cancel.mutateAsync({ id, data: { expectedVersion, reason } }),
    preparePdf: (id: string) => pdf.mutateAsync({ id }),
    downloadPdf: api.downloadArtifact,
  }
}
