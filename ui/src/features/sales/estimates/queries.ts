import type { QueryClient } from '@tanstack/react-query'

import * as api from '../../../api/generated/sales/sales'
import { refreshSales } from '../refresh'

export const useEstimates = (params?: Parameters<typeof api.listEstimates>[0], enabled = true) =>
  api.useListEstimates(params, { query: { enabled } })
export const useEstimate = (id: string, enabled = true) =>
  api.useGetEstimate(id, { query: { enabled } })
export const useEstimateArtifacts = (id: string, enabled = true) =>
  api.useListEstimateArtifacts(id, {
    query: { enabled, refetchInterval: (query) => (query.state.data?.length ? false : 2000) },
  })
export const refreshEstimates = (client: QueryClient) => refreshSales(client)

export function useEstimateActions() {
  const create = api.useCreateEstimate()
  const update = api.useUpdateEstimate()
  const remove = api.useDeleteEstimate()
  const issue = api.useIssueEstimate()
  const accept = api.useAcceptEstimate()
  const reject = api.useRejectEstimate()
  const cancel = api.useCancelEstimate()
  const prepare = api.usePrepareEstimatePdf()
  return {
    create: (data: Parameters<typeof api.createEstimate>[0]) => create.mutateAsync({ data }),
    update: (id: string, data: Parameters<typeof api.updateEstimate>[1]) =>
      update.mutateAsync({ id, data }),
    delete: (id: string, expectedVersion: number) =>
      remove.mutateAsync({ id, data: { expectedVersion } }),
    issue: (id: string, expectedVersion: number) =>
      issue.mutateAsync({ id, data: { expectedVersion } }),
    accept: (id: string, expectedVersion: number) =>
      accept.mutateAsync({ id, data: { expectedVersion } }),
    reject: (id: string, expectedVersion: number) =>
      reject.mutateAsync({ id, data: { expectedVersion } }),
    cancel: (id: string, expectedVersion: number, reason: string) =>
      cancel.mutateAsync({ id, data: { expectedVersion, reason } }),
    preparePdf: (id: string) => prepare.mutateAsync({ id }),
    downloadPdf: api.downloadArtifact,
  }
}
