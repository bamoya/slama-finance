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

export const customerStatusFilters = [
  'not_started',
  'trial',
  'active',
  'past_due',
  'expired',
  'suspended',
] as const
