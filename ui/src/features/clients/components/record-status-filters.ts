import {
  DeliveryNotePageItemsItemStatus,
  EstimatePageItemsItemStatus,
  InvoicePageItemsItemStatus,
  PaymentPageItemsItemStatus,
} from '../../../api/generated/models'

export const recordStatusFilters = [
  {
    section: 'estimates',
    key: 'estimateStatus',
    kind: 'estimate',
    options: Object.values(EstimatePageItemsItemStatus),
  },
  {
    section: 'invoices',
    key: 'invoiceStatus',
    kind: 'invoice',
    options: Object.values(InvoicePageItemsItemStatus),
  },
  {
    section: 'payments',
    key: 'paymentStatus',
    kind: 'payment',
    options: Object.values(PaymentPageItemsItemStatus),
  },
  {
    section: 'delivery_notes',
    key: 'deliveryStatus',
    kind: 'delivery_note',
    options: Object.values(DeliveryNotePageItemsItemStatus),
  },
] as const

export type RecordSection = (typeof recordStatusFilters)[number]['section']
export type RecordStatusKey = (typeof recordStatusFilters)[number]['key']
