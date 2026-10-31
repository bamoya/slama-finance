import { Link } from 'wouter'

import { useGetAdminOwner } from '../../../../api/generated/administration/administration'
import { RequestState } from '../../../../components/management/request-state'
import { StatusBadge } from '../../../../components/management/status-badge'
import { buttonVariants } from '../../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card'
import { displayDateTime } from '../../../../lib/dates'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import {
  cycleLabel,
  formatDh,
  paymentKindLabel,
  paymentStatusTone,
  planLabel,
} from '../../subscriptions/components/billing-format'
import { adminPaths } from '../admin-paths'
import { AdminLayout } from '../components/admin-layout'
import { AdminTable } from '../components/admin-table'
import { subscriptionStatusLabel } from '../components/subscription-labels'

const paymentStatus = {
  confirmed: 'Confirmed',
  rejected: 'Rejected',
  submitted: 'Awaiting verification',
} as const

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  )
}

export function AdminOwnerDetailPage({ ownerId }: { ownerId: string }) {
  useUiLanguage()
  const query = useGetAdminOwner(ownerId, { query: { retry: false } })
  const detail = query.data
  return (
    <AdminLayout title="Customer">
      <Link href={adminPaths.owners} className={buttonVariants({ variant: 'outline' })}>
        {translate('Back to customers')}
      </Link>
      {query.isPending || query.isError || !detail ? (
        <RequestState query={query} />
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="break-all">{detail.owner.email}</CardTitle>
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
                  label={translate('Status')}
                  value={subscriptionStatusLabel(detail.subscription.status)}
                />
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
          <Card>
            <CardHeader>
              <CardTitle>{translate('Payment history')}</CardTitle>
            </CardHeader>
            <CardContent>
              <AdminTable>
                <thead>
                  <tr>
                    <th>{translate('Submitted')}</th>
                    <th>{translate('Type')}</th>
                    <th>{translate('Plan')}</th>
                    <th>{translate('Reference')}</th>
                    <th className="text-right">{translate('Total incl. tax')}</th>
                    <th>{translate('Status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {!detail.payments.length && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-[var(--muted)]">
                        {translate('No payments yet.')}
                      </td>
                    </tr>
                  )}
                  {detail.payments.map((p) => (
                    <tr key={p.id} className="border-t border-[var(--border)]">
                      <td className="whitespace-nowrap">{displayDateTime(p.submittedAt)}</td>
                      <td>{paymentKindLabel(p.kind)}</td>
                      <td className="whitespace-nowrap">
                        {planLabel(p.planCode)} · {cycleLabel(p.cycle)}
                      </td>
                      <td className="break-all">{p.reference}</td>
                      <td className="whitespace-nowrap text-right">
                        {formatDh(p.amount.amountTtc)}
                      </td>
                      <td>
                        <StatusBadge
                          label={paymentStatus[p.status]}
                          tone={paymentStatusTone(p.status)}
                        />
                        {p.rejectionReason && (
                          <p className="mt-1 text-xs text-[var(--muted)]">
                            {translate('Reason:')} {p.rejectionReason}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </AdminTable>
            </CardContent>
          </Card>
        </div>
      )}
    </AdminLayout>
  )
}
