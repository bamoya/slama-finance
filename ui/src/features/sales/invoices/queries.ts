import type { QueryClient } from '@tanstack/react-query'

import * as api from '../../../api/generated/sales/sales'
import { refreshSales } from '../refresh'

export const useInvoices = (params?: Parameters<typeof api.listInvoices>[0], enabled = true) =>
  api.useListInvoices(params, { query: { enabled } })
export const useInvoice = (id: string, enabled = true) =>
  api.useGetInvoice(id, { query: { enabled } })
export const useInvoiceArtifacts = (id: string, enabled = true) =>
  api.useListInvoiceArtifacts(id, {
    query: { enabled, refetchInterval: (query) => (query.state.data?.length ? false : 2000) },
  })
export const useEstimateInvoices = (id: string, enabled = true) =>
  api.useListInvoicesFromEstimate(id, { query: { enabled } })
export const refreshInvoices = (client: QueryClient) => refreshSales(client)

export function useInvoiceActions() {
  const create = api.useCreateInvoice()
  const update = api.useUpdateInvoice()
  const remove = api.useDeleteInvoice()
  const issue = api.useIssueInvoice()
  const cancel = api.useCancelInvoice()
  const prepare = api.usePrepareInvoicePdf()
  const convert = api.useCreateInvoiceFromEstimate()
  const convertDeliveries = api.useCreateInvoiceFromDeliveries()
  return {
    create: (data: Parameters<typeof api.createInvoice>[0]) => create.mutateAsync({ data }),
    update: (id: string, data: Parameters<typeof api.updateInvoice>[1]) =>
      update.mutateAsync({ id, data }),
    delete: (id: string, expectedVersion: number) =>
      remove.mutateAsync({ id, data: { expectedVersion } }),
    issue: (id: string, expectedVersion: number) =>
      issue.mutateAsync({ id, data: { expectedVersion } }),
    cancel: (id: string, expectedVersion: number, reason: string) =>
      cancel.mutateAsync({ id, data: { expectedVersion, reason } }),
    preparePdf: (id: string) => prepare.mutateAsync({ id }),
    convert: (id: string, operationId: string, dueDate: string | null) =>
      convert.mutateAsync({ id, data: { operationId, dueDate } }),
    convertDeliveries: (data: Parameters<typeof api.createInvoiceFromDeliveries>[0]) =>
      convertDeliveries.mutateAsync({ data }),
    downloadPdf: api.downloadArtifact,
  }
}
