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
  lifecycle: AdminLifecyclePort
}

export type AdminLifecycleState = {
  status: string
  planCode: string
  paidThroughAt: Date | null
  row: { trialEndsAt: Date; suspendedAt: Date | null } | null
}

/** Subscription lifecycle changes run inside the administrator's transaction. */
export type AdminLifecyclePort = {
  state: (ownerId: string, tx: Transaction) => Promise<AdminLifecycleState>
  suspend: (ownerId: string, tx: Transaction) => Promise<void>
  resume: (ownerId: string, tx: Transaction) => Promise<void>
  changePlan: (
    ownerId: string,
    planCode: string,
    decidedBy: string,
    tx: Transaction,
  ) => Promise<void>
  extend: (ownerId: string, days: number, decidedBy: string, tx: Transaction) => Promise<void>
  grant: (
    ownerId: string,
    grant: { planCode: string; cycle: 'monthly' | 'annual'; start: Date; end: Date },
    decidedBy: string,
    tx: Transaction,
  ) => Promise<void>
}
