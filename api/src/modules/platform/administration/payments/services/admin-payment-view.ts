import type { AdminPayment } from '../../../../../contracts/generated/administration/administration.schemas.js'
import { publicCustomer } from '../../../subscriptions/index.js'
import type { createAdminPaymentRepository } from '../repositories/admin-payment.repository.js'

export type AdminPaymentRecord = NonNullable<
  Awaited<ReturnType<ReturnType<typeof createAdminPaymentRepository>['payment']>>
>['payment']

const iso = (value: Date | null) => value?.toISOString() ?? null

export function toAdminPayment(row: {
  payment: AdminPaymentRecord
  ownerEmail: string
  planVersionNumber: number
  quoteExpiresAt: Date | null
  receivedTtc: number
  invoiceNumber: string | null
  customer: AdminPayment['customer']
}): AdminPayment {
  const p = row.payment
  return {
    id: p.id,
    ownerId: p.ownerId,
    ownerEmail: row.ownerEmail,
    planCode: p.planCode as AdminPayment['planCode'],
    planVersionNumber: row.planVersionNumber,
    cycle: p.cycle,
    kind: p.kind,
    status: p.status,
    method: p.method,
    reference: p.reference,
    amount: {
      currency: p.currency,
      amountHt: p.amountHt,
      taxRateBasisPoints: p.taxRateBasisPoints,
      taxAmount: p.taxAmount,
      amountTtc: p.amountTtc,
    },
    coverageStart: iso(p.coverageStart),
    coverageEnd: iso(p.coverageEnd),
    submittedAt: p.submittedAt.toISOString(),
    decidedAt: iso(p.decidedAt),
    decidedBy: p.decidedBy,
    receivedReference: p.receivedReference,
    rejectionReason: p.rejectionReason,
    quoteExpiresAt: iso(row.quoteExpiresAt),
    receivedTtc: row.receivedTtc,
    invoiceNumber: row.invoiceNumber,
    customer: row.customer && publicCustomer(row.customer),
  }
}

export const paymentDecisionSnapshot = (p: AdminPaymentRecord) => ({
  status: p.status,
  coverageStart: iso(p.coverageStart),
  coverageEnd: iso(p.coverageEnd),
  decidedBy: p.decidedBy,
  receivedReference: p.receivedReference,
  rejectionReason: p.rejectionReason,
})
