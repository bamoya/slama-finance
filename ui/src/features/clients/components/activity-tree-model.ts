import type {
  DeliveryNotePage,
  EstimatePage,
  InvoicePage,
  PaymentPage,
} from '../../../api/generated/models'
import { recordStatusFilters, type RecordStatusKey } from './record-status-filters'

export type ActivityNode = {
  id: string
  kind: 'estimate' | 'invoice' | 'delivery_note' | 'payment'
  href: string
  number: string | null
  date: string
  status: string
  amount?: string
  outstanding?: string
  paymentStatus?: string
  method?: string
  reference?: boolean
  children: ActivityNode[]
}
export type ActivityFilters = { search: string; from: string; to: string } & Partial<
  Record<RecordStatusKey, string>
>

type Estimate = Pick<
  EstimatePage['items'][number],
  'id' | 'number' | 'issueDate' | 'status' | 'total' | 'currency'
>
type Invoice = Pick<
  InvoicePage['items'][number],
  | 'id'
  | 'number'
  | 'issueDate'
  | 'status'
  | 'total'
  | 'currency'
  | 'outstandingAmount'
  | 'paymentStatus'
  | 'sourceEstimateId'
  | 'deliveryNoteIds'
>
type Delivery = Pick<
  DeliveryNotePage['items'][number],
  'id' | 'number' | 'invoiceId' | 'invoices' | 'deliveryDate' | 'status'
>
type Payment = Pick<
  PaymentPage['items'][number],
  'id' | 'number' | 'invoiceId' | 'paymentDate' | 'status' | 'amount' | 'currency' | 'method'
>

export function buildActivityTree(
  estimates: Estimate[],
  invoices: Invoice[],
  deliveries: Delivery[],
  payments: Payment[],
) {
  const roots: ActivityNode[] = []
  const estimateNodes = new Map<string, ActivityNode>()
  const invoiceNodes = new Map<string, ActivityNode>()
  for (const item of estimates) {
    const node: ActivityNode = {
      id: item.id,
      kind: 'estimate',
      href: `/estimates/${item.id}`,
      number: item.number,
      date: item.issueDate,
      status: item.status,
      amount: `${item.total} ${item.currency}`,
      children: [],
    }
    estimateNodes.set(item.id, node)
    roots.push(node)
  }
  for (const item of invoices) {
    const node: ActivityNode = {
      id: item.id,
      kind: 'invoice',
      href: `/invoices/${item.id}`,
      number: item.number,
      date: item.issueDate,
      status: item.status,
      amount: `${item.total} ${item.currency}`,
      outstanding: ['issued', 'sent'].includes(item.status)
        ? `${item.outstandingAmount} ${item.currency}`
        : undefined,
      paymentStatus: ['issued', 'sent'].includes(item.status) ? item.paymentStatus : undefined,
      children: [],
    }
    invoiceNodes.set(item.id, node)
    const parent = item.sourceEstimateId ? estimateNodes.get(item.sourceEstimateId) : undefined
    ;(parent?.children ?? roots).push(node)
  }
  for (const item of deliveries) {
    const parentIds = new Set([
      item.invoiceId,
      ...item.invoices.map((invoice) => invoice.id),
      ...invoices
        .filter((invoice) => invoice.deliveryNoteIds.includes(item.id))
        .map((invoice) => invoice.id),
    ])
    const parents = [...parentIds].flatMap((id) =>
      id && invoiceNodes.has(id) ? [invoiceNodes.get(id)!] : [],
    )
    const node: ActivityNode = {
      id: item.id,
      kind: 'delivery_note',
      href: `/delivery-notes/${item.id}`,
      number: item.number,
      date: item.deliveryDate,
      status: item.status,
      reference: parents.length > 1,
      children: [],
    }
    if (parents.length) parents.forEach((parent) => parent.children.push({ ...node }))
    else roots.push(node)
  }
  for (const item of payments) {
    const node: ActivityNode = {
      id: item.id,
      kind: 'payment',
      href: `/payments/${item.id}`,
      number: item.number,
      date: item.paymentDate,
      status: item.status,
      amount: `${item.amount} ${item.currency}`,
      method: item.method,
      children: [],
    }
    ;(invoiceNodes.get(item.invoiceId)?.children ?? roots).push(node)
  }
  return roots.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
}

/** Keep ancestors of matching descendants, without manufacturing or summing relationships. */
export function filterActivityTree(
  nodes: ActivityNode[],
  filters: ActivityFilters,
): ActivityNode[] {
  return nodes.flatMap((node) => {
    const children = filterActivityTree(node.children, filters)
    const statusKey = recordStatusFilters.find((filter) => filter.kind === node.kind)!.key
    const matches =
      (!filters.search ||
        (node.number ?? '').toLowerCase().includes(filters.search.trim().toLowerCase())) &&
      (!filters[statusKey] || node.status === filters[statusKey]) &&
      (!filters.from || node.date >= filters.from) &&
      (!filters.to || node.date <= filters.to)
    return matches || children.length ? [{ ...node, children }] : []
  })
}
