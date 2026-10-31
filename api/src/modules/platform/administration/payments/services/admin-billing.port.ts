import type { OwnerSubscription } from '../../../../../contracts/generated/subscriptions/subscriptions.schemas.js'
import type { Transaction } from '../../../../../lib/db.js'
import type { AdminPaymentRecord } from './admin-payment-view.js'

export type PaymentDecision = (
  tx: Transaction,
  before: AdminPaymentRecord,
  after: AdminPaymentRecord,
) => Promise<void>

/** Billing operations owned by the subscriptions module, injected by composition. */
export type AdminBillingPort = {
  confirm: (
    id: string,
    decidedBy: string,
    receivedReference?: string,
    onDecided?: PaymentDecision,
  ) => Promise<unknown>
  reject: (
    id: string,
    decidedBy: string,
    reason: string,
    onDecided?: PaymentDecision,
  ) => Promise<unknown>
  summary: (ownerId: string) => Promise<OwnerSubscription>
}
