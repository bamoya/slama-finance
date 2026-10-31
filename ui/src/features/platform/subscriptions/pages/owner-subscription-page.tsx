import { useGetOwnerSubscription } from '../../../../api/generated/subscriptions/subscriptions'
import { RequestState } from '../../../../components/management/request-state'
import { buttonVariants } from '../../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card'
import { displayDateTime } from '../../../../lib/dates'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { OwnerPortalLayout } from '../../shared/components/owner-portal-layout'
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
          <Card>
            <CardHeader>
              <CardTitle>{s.planCode === 'trial' ? translate('Free trial') : s.planName}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <span className="inline-flex rounded-full border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1 text-sm font-semibold text-[var(--accent)]">
                {translate(
                  s.status === 'trial'
                    ? 'Free trial'
                    : s.status === 'not_started'
                      ? 'Trial not started'
                      : s.status === 'expired'
                        ? 'Expired'
                        : s.status === 'past_due'
                          ? 'Payment overdue'
                          : 'Active',
                )}
              </span>
              <p>
                {translate(
                  'The free trial lasts seven calendar days from your first organization.',
                )}
              </p>
              {s.trialEndsAt && (
                <p>
                  <strong>{translate('Trial ends')}: </strong>
                  {displayDateTime(s.trialEndsAt, 'Africa/Casablanca')}
                </p>
              )}
              {s.paidThroughAt && (
                <p>
                  {translate('Paid through')}:{' '}
                  {displayDateTime(s.paidThroughAt, 'Africa/Casablanca')}
                </p>
              )}
              <p className="text-sm text-[var(--muted)]">
                {translate(
                  'Paid activation requires payment confirmation. No automatic payment is taken.',
                )}
              </p>
              <a href="/contact" className={buttonVariants()}>
                {translate('Contact us')}
              </a>
            </CardContent>
          </Card>
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
        </div>
      )}
    </OwnerPortalLayout>
  )
}
