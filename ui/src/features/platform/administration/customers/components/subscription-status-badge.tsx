import { StatusBadge } from '../../../../../components/management/status-badge'
import { subscriptionStatusLabel, subscriptionStatusTones } from './subscription-labels'

export function SubscriptionStatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span aria-label="—">—</span>
  const tone = subscriptionStatusTones[status as keyof typeof subscriptionStatusTones] ?? 'archived'
  return <StatusBadge label={subscriptionStatusLabel(status)} tone={tone} />
}
