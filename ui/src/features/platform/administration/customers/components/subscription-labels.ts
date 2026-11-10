import { translate } from '../../../../../lib/i18n'

const labels: Record<string, string> = {
  trial: 'Free trial',
  not_started: 'Trial not started',
  expired: 'Expired',
  past_due: 'Payment overdue',
  active: 'Active',
  suspended: 'Subscription suspended',
}

export const subscriptionStatusTones = {
  active: 'active',
  trial: 'archived',
  not_started: 'archived',
  past_due: 'draft',
  expired: 'overdue',
  suspended: 'draft',
} as const

export function subscriptionStatusLabel(status: string | null | undefined) {
  return status ? translate(labels[status] ?? status) : '—'
}

export type SubscriptionError =
  'SUBSCRIPTION_CATALOG_UNAVAILABLE' | 'SUBSCRIPTION_PERIODS_INCONSISTENT' | null | undefined

/** Why a customer's access cannot be resolved; the API reports it instead of any inferred status. */
export function subscriptionErrorLabel(error: NonNullable<SubscriptionError>) {
  return translate(
    error === 'SUBSCRIPTION_CATALOG_UNAVAILABLE'
      ? 'Plan terms unavailable'
      : 'Coverage periods inconsistent',
  )
}

export function subscriptionErrorDescription(error: NonNullable<SubscriptionError>) {
  return translate(
    error === 'SUBSCRIPTION_CATALOG_UNAVAILABLE'
      ? 'The published plan terms of this customer cannot be read. Payments, restrictions and organizations remain available.'
      : 'The coverage periods of this customer are inconsistent. Payments, restrictions and organizations remain available.',
  )
}

export const customerStatusFilters = [
  'not_started',
  'trial',
  'active',
  'past_due',
  'expired',
  'suspended',
] as const
