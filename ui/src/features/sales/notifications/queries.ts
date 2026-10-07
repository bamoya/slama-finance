import type { QueryClient } from '@tanstack/react-query'

import * as api from '../../../api/generated/sales/sales'

export const downloadArtifact = api.downloadArtifact
export type NotificationDocumentType = 'invoice' | 'estimate' | 'report_run'
export const useDocumentNotifications = (
  documentType: NotificationDocumentType,
  id: string,
  params?: Parameters<typeof api.listDocumentNotifications>[2],
) =>
  api.useListDocumentNotifications(documentType, id, params, {
    query: {
      refetchInterval: (query) =>
        query.state.data?.items.some((row) => ['queued', 'running', 'sending'].includes(row.status))
          ? 3000
          : false,
    },
  })
export const refreshDocumentNotifications = (
  cache: QueryClient,
  documentType: NotificationDocumentType,
  id: string,
) =>
  cache.invalidateQueries({
    predicate: ({ queryKey }) =>
      queryKey[0] === `/v1/documents/${documentType}/${id}/notifications`,
  })
export function useSendDocumentActions() {
  const invoice = api.useSendInvoice(),
    estimate = api.useSendEstimate()
  return {
    send: (
      type: 'invoice' | 'estimate',
      id: string,
      data: Parameters<typeof api.sendInvoice>[1],
    ) =>
      type === 'invoice' ? invoice.mutateAsync({ id, data }) : estimate.mutateAsync({ id, data }),
    retry: api.retryDocumentNotification,
    cancel: api.cancelDocumentNotification,
    retryPreparation: api.retryNotificationPreparation,
    cancelPreparation: api.cancelNotificationPreparation,
  }
}
