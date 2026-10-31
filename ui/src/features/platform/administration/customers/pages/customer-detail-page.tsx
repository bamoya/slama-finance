import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import {
  useConfirmAdminPayment,
  useGetAdminOwner,
  useRejectAdminPayment,
} from '../../../../../api/generated/administration/administration'
import type { AdminPayment } from '../../../../../api/generated/models'
import { PageHeader } from '../../../../../components/management/page-header'
import { RequestState } from '../../../../../components/management/request-state'
import { StatusBadge } from '../../../../../components/management/status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '../../../../../components/ui/card'
import { displayDateTime } from '../../../../../lib/dates'
import { translate, useUiLanguage } from '../../../../../lib/i18n'
import {
  type Decision,
  PaymentDecisionDialog,
} from '../../payments/components/payment-decision-dialog'
import { adminPaths } from '../../shared/admin-paths'
import { AdministrationLayout } from '../../shared/components/administration-layout'
import { AdministrationPageHeader } from '../../shared/components/administration-page-header'
import type { CustomerAction } from '../components/customer-action'
import { CustomerActionDialogs } from '../components/customer-action-dialogs'
import { CustomerActionsMenu } from '../components/customer-actions-menu'
import { CustomerOrganizationsCard } from '../components/customer-organizations-card'
import { CustomerPaymentsCard } from '../components/customer-payments-card'
import { CustomerRestrictionBanner } from '../components/customer-restriction-banner'
import { CustomerSubscriptionCard } from '../components/customer-subscription-card'
import { ownerFullName } from '../components/owner-full-name'
import { SubscriptionStatusBadge } from '../components/subscription-status-badge'

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
  const client = useQueryClient()
  const query = useGetAdminOwner(customerId, { query: { retry: false } })
  const confirm = useConfirmAdminPayment()
  const reject = useRejectAdminPayment()
  const [action, setAction] = useState<CustomerAction | null>(null)
  const [decision, setDecision] = useState<{ payment: AdminPayment; decision: Decision } | null>(
    null,
  )
  const detail = query.data
  const refresh = () =>
    client.invalidateQueries({
      predicate: ({ queryKey }) =>
        typeof queryKey[0] === 'string' &&
        ['/api/v1/admin/payments', '/api/v1/admin/owners', '/api/v1/admin/overview'].some(
          (prefix) => String(queryKey[0]).startsWith(prefix),
        ),
    })
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
            brandName="B-Finance"
            eyebrow={translate('Customer')}
            title={ownerFullName(detail.owner) ?? detail.owner.email}
            description={
              ownerFullName(detail.owner)
                ? detail.owner.email
                : translate('Subscription, organizations and payment history of this customer.')
            }
            backHref={adminPaths.customers}
            status={
              <span className="flex flex-wrap items-center gap-2">
                <SubscriptionStatusBadge status={detail.subscription.status} />
                {detail.restriction.blockedAt && <StatusBadge label="Blocked" tone="overdue" />}
                {detail.restriction.deletionRequestedAt && (
                  <StatusBadge label="Deletion scheduled" tone="overdue" />
                )}
                {detail.invitationPending && (
                  <StatusBadge label="Invitation pending" tone="draft" />
                )}
              </span>
            }
            actions={<CustomerActionsMenu detail={detail} onSelect={setAction} />}
          />
          <CustomerRestrictionBanner restriction={detail.restriction} />
          <Card>
            <CardHeader>
              <CardTitle>{translate('Profile')}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-3">
                <Item label={translate('Name')} value={ownerFullName(detail.owner) ?? '—'} />
                <Item
                  label={translate('Registered')}
                  value={displayDateTime(detail.owner.createdAt)}
                />
                <Item
                  label={translate('Account')}
                  value={translate(
                    detail.restriction.blockedAt
                      ? 'Blocked'
                      : detail.invitationPending
                        ? 'Invitation pending'
                        : detail.owner.disabledAt
                          ? 'Disabled'
                          : 'Active',
                  )}
                />
              </dl>
            </CardContent>
          </Card>
          <CustomerSubscriptionCard
            detail={detail}
            onDecide={(payment, next) => setDecision({ payment, decision: next })}
          />
          <CustomerOrganizationsCard organizations={detail.organizations} onSelect={setAction} />
          <CustomerPaymentsCard payments={detail.payments} />
          {action && (
            <CustomerActionDialogs
              detail={detail}
              action={action}
              onClose={() => setAction(null)}
            />
          )}
          {decision && (
            <PaymentDecisionDialog
              payment={decision.payment}
              decision={decision.decision}
              onClose={() => setDecision(null)}
              onConfirm={async (receivedReference) => {
                await confirm.mutateAsync({
                  paymentId: decision.payment.id,
                  data: receivedReference ? { receivedReference } : {},
                })
                await refresh()
              }}
              onReject={async (reason) => {
                await reject.mutateAsync({ paymentId: decision.payment.id, data: { reason } })
                await refresh()
              }}
            />
          )}
        </>
      )}
    </AdministrationLayout>
  )
}
