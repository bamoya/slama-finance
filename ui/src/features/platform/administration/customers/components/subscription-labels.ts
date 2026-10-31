import { translate } from '../../../../../lib/i18n'

const labels: Record<string, string> = {
  trial: 'Free trial',
  not_started: 'Trial not started',
  expired: 'Expired',
  past_due: 'Payment overdue',
  active: 'Active',
}

export const subscriptionStatusTones = {
  active: 'active',
  trial: 'archived',
  not_started: 'archived',
  past_due: 'draft',
  expired: 'overdue',
} as const

export function subscriptionStatusLabel(status: string | null | undefined) {
  return status ? translate(labels[status] ?? status) : '—'
}
