import { useGetOwnerSubscription } from '../../../../api/generated/subscriptions/subscriptions'
import { RequestState } from '../../../../components/management/request-state'
import { buttonVariants } from '../../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card'
import { displayDateTime } from '../../../../lib/dates'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { OwnerPortalLayout } from '../../shared/components/owner-portal-layout'
import { CancellationCard } from '../components/cancellation-card'
import { PaymentHistory } from '../components/payment-history'
import { PlanCheckout } from '../components/plan-checkout'
import { SubscriptionStatusCard } from '../components/subscription-status-card'
import { UsageMeter } from '../components/usage-meter'
export function OwnerSubscriptionPage() {
  useUiLanguage()
  const query = useGetOwnerSubscription({ query: { retry: false } }),
    s = query.data
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
                    translate('Organizations'),
                    `${s.organizationCount} / ${s.entitlements.organizations ?? translate('Unlimited')}`,
                  ],
                  [
                    translate('Members per organization'),
                    String(s.entitlements.staffPerOrganization ?? translate('Unlimited')),
                  ],
                  [translate('Storage allowance'), `${s.entitlements.storageBytes / 1e9} GB`],
                  [
                    translate(
                      s.planCode === 'trial'
                        ? 'Business emails during trial'
                        : 'Business emails per month',
                    ),
                    String(s.entitlements.businessEmails),
                  ],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-sm text-[var(--muted)]">{label}</dt>
                    <dd className="mt-1 text-lg font-semibold">{value}</dd>
                  </div>
                ))}
              </dl>
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
        </div>
      )}
    </OwnerPortalLayout>
  )
}
