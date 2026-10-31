import { useGetAdminOwner } from '../../../../../api/generated/administration/administration'
import type { AdminOwnerDetailPaymentsItem } from '../../../../../api/generated/models'
import { type DataColumn, DataTable } from '../../../../../components/management/data-table'
import { PageHeader } from '../../../../../components/management/page-header'
import { RequestState } from '../../../../../components/management/request-state'
import { StatusBadge } from '../../../../../components/management/status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '../../../../../components/ui/card'
import { displayDateTime } from '../../../../../lib/dates'
import { translate, useUiLanguage } from '../../../../../lib/i18n'
import {
  cycleLabel,
  formatDh,
  paymentKindLabel,
  paymentStatusTone,
  planLabel,
} from '../../../subscriptions/components/billing-format'
import { adminPaths } from '../../shared/admin-paths'
import { AdministrationLayout } from '../../shared/components/administration-layout'
import { AdministrationPageHeader } from '../../shared/components/administration-page-header'
import { SubscriptionStatusBadge } from '../components/subscription-status-badge'

const paymentStatus = {
  confirmed: 'Confirmed',
  rejected: 'Rejected',
  submitted: 'Awaiting verification',
} as const

type CustomerPayment = AdminOwnerDetailPaymentsItem

const paymentColumns: DataColumn<CustomerPayment>[] = [
  {
    title: 'Submitted',
    render: (p) => <span className="whitespace-nowrap">{displayDateTime(p.submittedAt)}</span>,
  },
  { title: 'Type', render: (p) => paymentKindLabel(p.kind) },
  {
    title: 'Plan',
    render: (p) => (
      <span className="whitespace-nowrap">
        {planLabel(p.planCode)} · {cycleLabel(p.cycle)}
      </span>
    ),
  },
  { title: 'Reference', render: (p) => <span className="break-all">{p.reference}</span> },
  {
    title: 'Total incl. tax',
    align: 'right',
    render: (p) => <span className="whitespace-nowrap">{formatDh(p.amount.amountTtc)}</span>,
  },
  {
    title: 'Status',
    render: (p) => (
      <>
        <StatusBadge label={paymentStatus[p.status]} tone={paymentStatusTone(p.status)} />
        {p.rejectionReason && (
          <p className="mt-1 text-xs text-[var(--muted)]">
            {translate('Reason:')} {p.rejectionReason}
          </p>
        )}
      </>
    ),
  },
]

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  )
}

export function AdminCustomerDetailPage({ customerId }: { customerId: string }) {
  useUiLanguage()
  const query = useGetAdminOwner(customerId, { query: { retry: false } })
  const detail = query.data
  return (
    <AdministrationLayout title="Customer">
      {query.isPending || query.isError || !detail ? (
        <>
          <AdministrationPageHeader
            title="Customer"
            description="Subscription, organizations and payment history of this customer."
            backHref={adminPaths.customers}
          />
          <RequestState query={query} />
        </>
      ) : (
        <>
          <PageHeader
            brandName="BaMoYa Finance"
            eyebrow={translate('Customer')}
            title={detail.owner.email}
            description={translate(
              'Subscription, organizations and payment history of this customer.',
            )}
            backHref={adminPaths.customers}
            status={<SubscriptionStatusBadge status={detail.subscription.status} />}
          />
          <Card>
            <CardHeader>
              <CardTitle>{translate('Profile')}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-3">
                <Item
                  label={translate('Name')}
                  value={
                    [detail.owner.firstName, detail.owner.lastName].filter(Boolean).join(' ') || '—'
                  }
                />
                <Item
                  label={translate('Registered')}
                  value={displayDateTime(detail.owner.createdAt)}
                />
                <Item
                  label={translate('Account')}
                  value={translate(detail.owner.disabledAt ? 'Disabled' : 'Active')}
                />
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{translate('Subscription')}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Item label={translate('Plan')} value={planLabel(detail.subscription.planCode)} />
                <Item
                  label={translate('Cycle')}
                  value={detail.subscription.cycle ? cycleLabel(detail.subscription.cycle) : '—'}
                />
                <Item
                  label={translate('Paid through')}
                  value={
                    detail.subscription.paidThroughAt
                      ? displayDateTime(detail.subscription.paidThroughAt)
                      : '—'
                  }
                />
                <Item
                  label={translate('Trial ends')}
                  value={
                    detail.subscription.trialEndsAt
                      ? displayDateTime(detail.subscription.trialEndsAt)
                      : '—'
                  }
                />
                <Item
                  label={translate('Organizations')}
                  value={`${detail.subscription.organizationCount} / ${detail.subscription.entitlements.organizations ?? translate('Unlimited')}`}
                />
                <Item
                  label={translate('Storage used')}
                  value={`${(detail.subscription.usage.storageBytes / 1e9).toFixed(2)} / ${detail.subscription.entitlements.storageBytes / 1e9} GB`}
                />
                <Item
                  label={translate('Business emails queued')}
                  value={`${detail.subscription.usage.businessEmails} / ${detail.subscription.entitlements.businessEmails}`}
                />
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{translate('Organizations')}</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.organizations.length ? (
                <ul className="divide-y divide-[var(--border)]">
                  {detail.organizations.map((organization) => (
                    <li key={organization.id} className="flex flex-wrap justify-between gap-2 py-2">
                      <span className="font-semibold">{organization.name}</span>
                      <span className="text-sm text-[var(--muted)]">
                        {displayDateTime(organization.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[var(--muted)]">{translate('No organizations yet.')}</p>
              )}
            </CardContent>
          </Card>
          <section aria-label={translate('Payment history')}>
            <Card className="gap-0 overflow-hidden p-0">
              <CardHeader className="border-b border-[var(--border)] p-4">
                <CardTitle>{translate('Payment history')}</CardTitle>
              </CardHeader>
              <DataTable
                items={detail.payments}
                columns={paymentColumns}
                emptyTitle={translate('No payments yet.')}
                emptyDescription={translate('Payments submitted by this customer appear here.')}
              />
            </Card>
          </section>
        </>
      )}
    </AdministrationLayout>
  )
}
