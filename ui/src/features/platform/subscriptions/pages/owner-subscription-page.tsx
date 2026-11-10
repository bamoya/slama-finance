import { useQueryClient } from '@tanstack/react-query'

import { useGetOwnerSession } from '../../../../api/generated/identity/identity'
import {
  getGetOwnerBillingQueryKey,
  getGetOwnerSubscriptionQueryKey,
  getListOwnerSubscriptionPaymentsQueryKey,
  useGetOwnerSubscription,
} from '../../../../api/generated/subscriptions/subscriptions'
import { RequestState } from '../../../../components/management/request-state'
import { buttonVariants } from '../../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card'
import { displayDateTime } from '../../../../lib/dates'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { useAccessDeadline } from '../../../../lib/use-access-deadline'
import { OwnerPortalLayout } from '../../shared/components/owner-portal-layout'
import { CancellationCard } from '../components/cancellation-card'
import { InvoiceHistory } from '../components/invoice-history'
import { PaymentHistory } from '../components/payment-history'
import { PlanCheckout } from '../components/plan-checkout'
import { SubscriptionStatusCard } from '../components/subscription-status-card'
import { UsageMeter } from '../components/usage-meter'
export function OwnerSubscriptionPage() {
  useUiLanguage()
  const query = useGetOwnerSubscription({ query: { retry: false } }),
    s = query.data
  const cache = useQueryClient()
  const account = useGetOwnerSession({ query: { retry: false, staleTime: 30_000 } }).data?.owner.id
  // Resolved access may change at this instant: read the subscription, history and selling terms again.
  useAccessDeadline({
    deadline: s?.accessValidUntil,
    scope: account,
    updatedAt: query.dataUpdatedAt,
    onDeadline: () =>
      Promise.all(
        [
          getGetOwnerSubscriptionQueryKey(),
          getGetOwnerBillingQueryKey(),
          getListOwnerSubscriptionPaymentsQueryKey(),
        ].map((queryKey) => cache.invalidateQueries({ queryKey })),
      ),
  })
  const sources = new Map((s?.entitlementSources ?? []).map((x) => [x.entitlementKey, x]))
  /** Customer-specific allowance agreed with B-Finance, shown without internal notes. */
  const custom = (key: string) => {
    const source = sources.get(key as never)
    if (source?.source !== 'override') return null
    return source.effectiveUntil
      ? translate('Custom allowance until {{date}}', {
          date: displayDateTime(source.effectiveUntil, 'Africa/Casablanca'),
        })
      : translate('Custom allowance')
  }
  const customFeatures = [...sources.values()].some(
    (x) =>
      x.source === 'override' &&
      !['organizations', 'staffPerOrganization', 'storageBytes', 'businessEmails'].includes(
        x.entitlementKey,
      ),
  )
  return (
    <OwnerPortalLayout>
      <header className="owner-page-heading">
        <div>
          <span className="owner-eyebrow">{translate('Owner portal')}</span>
          <h1>{translate('Your subscription')}</h1>
          <p>{translate('Your plan, allowances and usage in one place.')}</p>
        </div>
        <a href="/tarifs" className={buttonVariants({ variant: 'outline' })}>
          {translate('Compare plans')}
        </a>
      </header>
      {query.isPending || query.error || !s ? (
        <RequestState query={query} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <SubscriptionStatusCard s={s} />
          <Card>
            <CardHeader>
              <CardTitle>{translate('Plan allowances')}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-5">
                {[
                  [
                    'organizations',
                    translate('Organizations'),
                    `${s.organizationCount} / ${s.entitlements.organizations ?? translate('Unlimited')}`,
                  ],
                  [
                    'staffPerOrganization',
                    translate('Members per organization'),
                    String(s.entitlements.staffPerOrganization ?? translate('Unlimited')),
                  ],
                  [
                    'storageBytes',
                    translate('Storage allowance'),
                    `${s.entitlements.storageBytes / 1e9} GB`,
                  ],
                  [
                    'businessEmails',
                    translate(
                      s.planCode === 'trial'
                        ? 'Business emails during trial'
                        : 'Business emails per month',
                    ),
                    String(s.entitlements.businessEmails),
                  ],
                ].map(([key, label, value]) => (
                  <div key={key}>
                    <dt className="text-sm text-[var(--muted)]">{label}</dt>
                    <dd className="mt-1 text-lg font-semibold">{value}</dd>
                    {custom(key!) && (
                      <dd className="text-xs text-[var(--accent)]">{custom(key!)}</dd>
                    )}
                  </div>
                ))}
              </dl>
              {customFeatures && (
                <p className="mt-4 text-sm text-[var(--muted)]">
                  {translate('Some features of your subscription are customized.')}
                </p>
              )}
              <div className="mt-5 space-y-5 border-t border-[var(--border)] pt-5">
                <UsageMeter
                  label={translate('Storage used')}
                  used={s.usage.storageBytes / 1e9}
                  limit={s.entitlements.storageBytes / 1e9}
                  unit="GB"
                />
                <UsageMeter
                  label={translate('Business emails queued')}
                  used={s.usage.businessEmails}
                  limit={s.entitlements.businessEmails}
                />
                {s.usage.emailPeriodEnd && (
                  <p className="text-xs text-[var(--muted)]">
                    {translate(
                      s.planCode === 'trial' ? 'Trial allowance ends' : 'Next email reset',
                    )}
                    : {displayDateTime(s.usage.emailPeriodEnd, 'Africa/Casablanca')}
                  </p>
                )}
                <p className="text-xs text-[var(--muted)]">
                  {translate(
                    'Usage is shared across your organizations. Security emails do not count. Pending files count until deletion is confirmed.',
                  )}
                </p>
              </div>
              <p className="mt-5 border-t border-[var(--border)] pt-4 text-sm text-[var(--muted)]">
                {translate(
                  'The initial administrator counts toward the member limit. Disabled members count; archived members do not.',
                )}
              </p>
            </CardContent>
          </Card>
          <div className="grid gap-4 lg:col-span-2 lg:grid-cols-2">
            <PlanCheckout s={s} />
            <CancellationCard s={s} />
          </div>
          <div className="lg:col-span-2">
            <PaymentHistory />
          </div>
          <div className="lg:col-span-2">
            <InvoiceHistory />
          </div>
        </div>
      )}
    </OwnerPortalLayout>
  )
}
