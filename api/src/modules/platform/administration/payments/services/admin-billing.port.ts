import type { OwnerSubscription } from '../../../../../contracts/generated/subscriptions/subscriptions.schemas.js'
import type { Transaction } from '../../../../../lib/db.js'
import type { LifecycleStatusSource } from '../../shared/repositories/lifecycle-status.repository.js'
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
    transaction?: Transaction,
  ) => Promise<unknown>
  reject: (
    id: string,
    decidedBy: string,
    reason: string,
    onDecided?: PaymentDecision,
    transaction?: Transaction,
  ) => Promise<unknown>
  summary: (ownerId: string) => Promise<OwnerSubscription>
  lifecycle: AdminLifecyclePort
  /** Set-based lifecycle status (owner_id, trial_ends_at, status) at `at`, same authority as the API. */
  lifecycleStatus: LifecycleStatusSource
}

export type AdminLifecycleState = {
  status: string
  planCode: string
  paidThroughAt: Date | null
  row: { trialEndsAt: Date; suspendedAt: Date | null } | null
}

/** Acting administrator; the reason is recorded as the coverage period note. */
export type AdminLifecycleActor = { adminId: string; email: string; reason: string }

/** Subscription lifecycle changes run inside the administrator's transaction. */
export type AdminLifecyclePort = {
  state: (ownerId: string, tx: Transaction) => Promise<AdminLifecycleState>
  suspend: (ownerId: string, tx: Transaction) => Promise<void>
  resume: (ownerId: string, tx: Transaction) => Promise<void>
  changePlan: (
    ownerId: string,
    planCode: string,
    actor: AdminLifecycleActor,
    tx: Transaction,
  ) => Promise<void>
  extend: (
    ownerId: string,
    days: number,
    actor: AdminLifecycleActor,
    tx: Transaction,
  ) => Promise<void>
  activate: (
    ownerId: string,
    input: {
      planCode: string
      cycle: 'monthly' | 'annual'
      startsOn: string
      endsOn: string
      settlement: { kind: 'complimentary' } | { kind: 'payment'; method: string; reference: string }
    },
    actor: AdminLifecycleActor,
    tx: Transaction,
  ) => Promise<void>
  grant: (
    ownerId: string,
    grant: { planCode: string; cycle: 'monthly' | 'annual'; start: Date; end: Date },
    actor: AdminLifecycleActor,
    tx: Transaction,
  ) => Promise<void>
}
