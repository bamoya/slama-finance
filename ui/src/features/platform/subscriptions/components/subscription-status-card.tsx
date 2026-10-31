import type { OwnerSubscription } from '../../../../api/generated/models'
import { buttonVariants } from '../../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card'
import { displayDateTime } from '../../../../lib/dates'
import { translate } from '../../../../lib/i18n'
import { cycleLabel, formatDh, paymentKindLabel, planLabel } from './billing-format'

const statusLabel = {
  trial: 'Free trial',
  not_started: 'Trial not started',
  expired: 'Expired',
  past_due: 'Payment overdue',
  active: 'Active',
} as const

function DateLine({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <p>
      <strong>{label}: </strong>
      {displayDateTime(value, 'Africa/Casablanca')}
    </p>
  )
}

export function SubscriptionStatusCard({ s }: { s: OwnerSubscription }) {
  const pending = s.pendingPayment
  return (
    <Card>
      <CardHeader>
        <CardTitle>{s.planCode === 'trial' ? translate('Free trial') : s.planName}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            data-testid="subscription-status"
            className="inline-flex rounded-full border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1 text-sm font-semibold text-[var(--accent)]"
          >
            {translate(statusLabel[s.status])}
          </span>
          {s.cycle && s.planCode !== 'trial' && (
            <span className="text-sm text-[var(--muted)]">{cycleLabel(s.cycle)}</span>
          )}
          {s.cancelAtPeriodEnd && (
            <span className="inline-flex rounded-full border border-[var(--border)] px-3 py-1 text-sm font-semibold">
              {translate('Cancels at period end')}
            </span>
          )}
        </div>
        <p>{translate('The free trial lasts seven calendar days from your first organization.')}</p>
        <div className="space-y-1">
          <DateLine label={translate('Trial ends')} value={s.trialEndsAt} />
          <DateLine label={translate('Covered until')} value={s.paidThroughAt} />
          <DateLine label={translate('Grace period ends')} value={s.graceEndsAt} />
          <DateLine label={translate('Access blocked since')} value={s.blockedAt} />
          <DateLine label={translate('Data retained until')} value={s.retentionEndsAt} />
          {s.nextPlanCode && (
            <p>
              <strong>{translate('Next plan')}: </strong>
              {planLabel(s.nextPlanCode)}
            </p>
          )}
        </div>
        {s.blockedAt && (
          <p role="status" className="text-sm text-[var(--error-text)]">
            {translate(
              'Access is blocked. Your data is kept until the retention date; deletion is never automatic.',
            )}
          </p>
        )}
        {pending && (
          <div
            role="status"
            data-testid="pending-payment"
            className="rounded-xl border border-[var(--border)] bg-[var(--accent-soft)] p-3 text-sm"
          >
            <p className="font-semibold">{translate('Payment awaiting verification')}</p>
            <p>
              {paymentKindLabel(pending.kind)} · {planLabel(pending.planCode)} ·{' '}
              {cycleLabel(pending.cycle)} · {formatDh(pending.amount.amountTtc)}
            </p>
            <p className="text-[var(--muted)]">
              {translate('An administrator must verify it before your plan is activated.')}
            </p>
          </div>
        )}
        <a href="/contact" className={buttonVariants({ variant: 'outline' })}>
          {translate('Contact us')}
        </a>
      </CardContent>
    </Card>
  )
}
