import type { QueryClient } from '@tanstack/react-query'

import * as api from '../../../api/generated/sales/sales'
import { refreshSales } from '../refresh'

export const usePayments = (params?: Parameters<typeof api.listPayments>[0], enabled = true) =>
  api.useListPayments(params, { query: { enabled } })
export const usePayment = (id: string, enabled = true) =>
  api.useGetPayment(id, { query: { enabled } })

export const refreshPayments = (client: QueryClient) => refreshSales(client)

export function usePaymentActions() {
  const create = api.useCreatePayment()
  const confirm = api.useConfirmPayment()
  const cancel = api.useCancelPayment()
  const restore = api.useRestorePayment()
  const remove = api.useDeletePayment()
  return {
    create: (data: Parameters<typeof api.createPayment>[0]) => create.mutateAsync({ data }),
    confirm: (id: string, data: Parameters<typeof api.confirmPayment>[1]) =>
      confirm.mutateAsync({ id, data }),
    cancel: (id: string, data: Parameters<typeof api.cancelPayment>[1]) =>
      cancel.mutateAsync({ id, data }),
    restore: (id: string, data: Parameters<typeof api.restorePayment>[1]) =>
      restore.mutateAsync({ id, data }),
    delete: (id: string, data: Parameters<typeof api.deletePayment>[1]) =>
      remove.mutateAsync({ id, data }),
  }
}
