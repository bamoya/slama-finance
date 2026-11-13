import * as api from '../../../../api/generated/sales/sales'
import { refreshSales } from '../refresh'

export const useCreditNotes = (
  params?: Parameters<typeof api.listCreditNotes>[0],
  enabled = true,
) => api.useListCreditNotes(params, { query: { enabled } })
export const useCreditNote = (id: string, enabled = true) =>
  api.useGetCreditNote(id, { query: { enabled } })
export const useInvoiceCreditNotes = (invoiceId: string, enabled = true) =>
  api.useListInvoiceCreditNotes(invoiceId, { query: { enabled } })
export const useInvoiceCreditableLines = (invoiceId: string, enabled = true) =>
  api.useGetInvoiceCreditableLines(invoiceId, { query: { enabled, staleTime: 0 } })
export const useCreditNoteArtifacts = (id: string, enabled = true) =>
  api.useListCreditNoteArtifacts(id, {
    query: { enabled, refetchInterval: (query) => (query.state.data?.length ? false : 2000) },
  })
export const refreshCreditNotes = refreshSales

export function useCreditNoteActions() {
  const create = api.useCreateCreditNote()
  const update = api.useUpdateCreditNote()
  const remove = api.useDeleteCreditNote()
  const issue = api.useIssueCreditNote()
  const prepare = api.usePrepareCreditNotePdf()
  return {
    create: (data: Parameters<typeof api.createCreditNote>[0]) => create.mutateAsync({ data }),
    update: (id: string, data: Parameters<typeof api.updateCreditNote>[1]) =>
      update.mutateAsync({ id, data }),
    delete: (id: string, expectedVersion: number) =>
      remove.mutateAsync({ id, data: { expectedVersion } }),
    issue: (id: string, expectedVersion: number) =>
      issue.mutateAsync({ id, data: { expectedVersion } }),
    preparePdf: (id: string) => prepare.mutateAsync({ id }),
    downloadPdf: api.downloadArtifact,
  }
}
