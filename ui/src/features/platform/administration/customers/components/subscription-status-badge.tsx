import { StatusBadge } from '../../../../../components/management/status-badge'
import { translate } from '../../../../../lib/i18n'
import {
  type SubscriptionError,
  subscriptionErrorLabel,
  subscriptionStatusLabel,
  subscriptionStatusTones,
} from './subscription-labels'

/** An unresolvable subscription shows its error, never a status the API did not state. */
export function SubscriptionStatusBadge({
  status,
  error,
}: {
  status: string | null | undefined
  error?: SubscriptionError
}) {
  if (!status && error) return <StatusBadge label={subscriptionErrorLabel(error)} tone="overdue" />
  if (!status) return <span aria-label={translate('Unavailable')}>—</span>
  const tone = subscriptionStatusTones[status as keyof typeof subscriptionStatusTones] ?? 'archived'
  return <StatusBadge label={subscriptionStatusLabel(status)} tone={tone} />
}
