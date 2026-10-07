import { useQuery } from '@tanstack/react-query'

import * as api from '../../api/generated/sales/sales'
import { useAuthorization } from '../identity'

export async function collectActivityPages<T>(
  load: (offset: number) => Promise<{ items: T[]; total: number }>,
) {
  const items: T[] = []
  for (;;) {
    const page = await load(items.length)
    if (!page.items.length && items.length < page.total)
      throw new Error('Activity page was incomplete. Please retry.')
    items.push(...page.items)
    if (!page.items.length || items.length >= page.total) return items
  }
}

export function useClientActivity(clientId: string) {
  const { can } = useAuthorization()
  const permissions = [
    'estimates.read',
    'invoices.read',
    'delivery_notes.read',
    'payments.read',
  ].map((key) => can(key))
  return useQuery({
    queryKey: ['/v1/clients', clientId, 'activity-tree', permissions],
    queryFn: async ({ signal }) => {
      const [estimates, invoices, deliveries, payments] = await Promise.all([
        permissions[0]
          ? collectActivityPages((offset) =>
              api.listEstimates({ clientId, limit: 100, offset }, undefined, signal),
            )
          : [],
        permissions[1]
          ? collectActivityPages((offset) =>
              api.listInvoices({ clientId, limit: 100, offset }, undefined, signal),
            )
          : [],
        permissions[2]
          ? collectActivityPages((offset) =>
              api.listDeliveryNotes({ clientId, limit: 100, offset }, undefined, signal),
            )
          : [],
        permissions[3]
          ? collectActivityPages((offset) =>
              api.listPayments({ clientId, limit: 100, offset }, undefined, signal),
            )
          : [],
      ])
      return { estimates, invoices, deliveries, payments }
    },
  })
}
