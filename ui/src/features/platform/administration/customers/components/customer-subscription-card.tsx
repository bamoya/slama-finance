import type { AdminOwnerDetail, AdminPayment } from '../../../../../api/generated/models'
import { Button } from '../../../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../../../components/ui/card'
import { displayDateTime } from '../../../../../lib/dates'
import { translate } from '../../../../../lib/i18n'
import {
  cycleLabel,
  formatDh,
  paymentKindLabel,
  planLabel,
  versionLabel,
} from '../../../subscriptions/components/billing-format'
import { type Decision } from '../../payments/components/payment-decision-dialog'
import { subscriptionErrorDescription } from './subscription-labels'
import { SubscriptionStatusBadge } from './subscription-status-badge'

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  )
}

const date = (value: string | null | undefined) => (value ? displayDateTime(value) : '—')

export function CustomerSubscriptionCard({
  detail,
  onDecide,
}: {
  detail: AdminOwnerDetail
  onDecide: (payment: AdminPayment, decision: Decision) => void
}) {
  const s = detail.subscription
  if (!s)
    return (
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>{translate('Subscription')}</CardTitle>
            <SubscriptionStatusBadge status={null} error={detail.subscriptionError} />
          </div>
        </CardHeader>
        <CardContent>
          <p role="status" data-testid="subscription-unavailable" className="text-sm">
            {detail.subscriptionError
              ? subscriptionErrorDescription(detail.subscriptionError)
              : translate('The subscription of this customer is unavailable.')}
          </p>
        </CardContent>
      </Card>
    )
  const pending = s.pendingPayment
  const asPayment = (): AdminPayment | null =>
    pending && {
      ...pending,
      ownerId: detail.owner.id,
      ownerEmail: detail.owner.email,
      decidedBy: null,
      receivedReference: null,
    }
  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>{translate('Subscription')}</CardTitle>
            <SubscriptionStatusBadge status={s.status} />
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Item label={translate('Plan')} value={planLabel(s.planCode)} />
            <Item
              label={translate('Plan version')}
              value={s.planVersionNumber === null ? '—' : versionLabel(s.planVersionNumber)}
            />
            <Item label={translate('Cycle')} value={s.cycle ? cycleLabel(s.cycle) : '—'} />
            <Item label={translate('Covered until')} value={date(s.paidThroughAt)} />
            <Item label={translate('Trial ends')} value={date(s.trialEndsAt)} />
            <Item label={translate('Grace period ends')} value={date(s.graceEndsAt)} />
            <Item label={translate('Access blocked since')} value={date(s.blockedAt)} />
            <Item label={translate('Data retained until')} value={date(s.retentionEndsAt)} />
            <Item
              label={translate('Next plan')}
              value={s.nextPlanCode ? planLabel(s.nextPlanCode) : '—'}
            />
            {s.scheduledVersionTransition && (
              <Item
                label={translate('Plan update')}
                value={`${versionLabel(s.scheduledVersionTransition.targetVersionNumber)} · ${date(s.scheduledVersionTransition.effectiveAt)}`}
              />
            )}
            <Item
              label={translate('Organizations')}
              value={`${s.organizationCount} / ${s.entitlements.organizations ?? translate('Unlimited')}`}
            />
            <Item
              label={translate('Storage used')}
              value={`${(s.usage.storageBytes / 1e9).toFixed(2)} / ${s.entitlements.storageBytes / 1e9} GB`}
            />
            <Item
              label={translate('Business emails queued')}
              value={`${s.usage.businessEmails} / ${s.entitlements.businessEmails}`}
            />
            {s.cancelAtPeriodEnd && (
              <Item label={translate('Renewal')} value={translate('Cancels at period end')} />
            )}
          </dl>
          {s.status === 'suspended' && (
            <p className="mt-4 text-sm text-[var(--muted)]">
              {translate('Suspended by an administrator: the coverage clock is frozen.')}
            </p>
          )}
        </CardContent>
      </Card>
      {pending && (
        <Card className="border-[var(--accent)]">
          <CardHeader>
            <CardTitle>{translate('Payment awaiting verification')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <dl className="grid flex-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Item
                label={translate('Plan')}
                value={`${planLabel(pending.planCode)} · ${versionLabel(pending.planVersionNumber)} · ${cycleLabel(pending.cycle)}`}
              />
              <Item label={translate('Type')} value={paymentKindLabel(pending.kind)} />
              <Item label={translate('Reference')} value={pending.reference} />
              <Item
                label={translate('Total incl. tax')}
                value={formatDh(pending.amount.amountTtc)}
              />
            </dl>
            <div className="flex gap-2">
              <Button onClick={() => onDecide(asPayment()!, 'confirm')}>
                {translate('Confirm')}
              </Button>
              <Button variant="outline" onClick={() => onDecide(asPayment()!, 'reject')}>
                {translate('Reject')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  )
}
