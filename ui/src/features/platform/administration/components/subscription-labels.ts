import { translate } from '../../../../lib/i18n'

const labels: Record<string, string> = {
  trial: 'Free trial',
  not_started: 'Trial not started',
  expired: 'Expired',
  past_due: 'Payment overdue',
  active: 'Active',
}

export function subscriptionStatusLabel(status: string | null | undefined) {
  return status ? translate(labels[status] ?? status) : '—'
}
