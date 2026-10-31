import { Link, Redirect } from 'wouter'

import { useGetOwnerOrganization } from '../../../../api/generated/identity/identity'
import { PageHeader } from '../../../../components/management/page-header'
import { RequestState } from '../../../../components/management/request-state'
import { buttonVariants } from '../../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card'
import { displayDate } from '../../../../lib/dates'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { OwnerPortalLayout } from '../../shared/components/owner-portal-layout'
import { OrganizationStatus } from '../components/organization-status'

function OrganizationDetail({ organizationId }: { organizationId: string }) {
  useUiLanguage()
  const result = useGetOwnerOrganization(organizationId, { query: { retry: false } })
  if (result.error?.status === 401) return <Redirect to="/owner/login" />
  if (result.isPending || result.error || !result.data) return <RequestState query={result} />
  const organization = result.data
  return (
    <>
      <PageHeader
        brandName="B-Finance"
        eyebrow={translate('Organizations')}
        title={organization.name}
        description={translate('Organization identity and owner access.')}
        backHref="/owner"
        status={<OrganizationStatus status={organization.status} />}
        actions={
          organization.status === 'setup' ? (
            <Link
              href={`/owner/organizations/${organization.id}/setup`}
              className={buttonVariants({ variant: 'outline' })}
            >
              {translate('Resume setup')}
            </Link>
          ) : organization.status === 'active' ? (
            <a href={`/organizations/${organization.id}/login`} className={buttonVariants()}>
              {translate('Open organization')}
            </a>
          ) : undefined
        }
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{translate('Organization details')}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-5 sm:grid-cols-2">
              {[
                [translate('Organization name'), organization.name],
                [translate('Organization slug'), organization.slug],
                [translate('Language'), organization.locale === 'fr' ? 'Français' : 'English'],
                [translate('Created on'), displayDate(organization.createdAt)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-sm text-[var(--muted)]">{label}</dt>
                  <dd className="mt-1 break-words font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{translate('Your access')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="font-semibold text-[var(--accent)]">{translate('Organization owner')}</p>
            <p className="text-sm text-[var(--muted)]">
              {translate(
                'Your platform account and organization administrator account have separate credentials. The administrator counts toward the member limit.',
              )}
            </p>
            <div className="flex items-center justify-between border-t border-[var(--border)] pt-4 text-sm">
              <span>{translate('Members')}</span>
              <strong>{organization.staffCount}</strong>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
export function OwnerOrganizationPage({ organizationId }: { organizationId: string }) {
  return (
    <OwnerPortalLayout>
      <OrganizationDetail organizationId={organizationId} />
    </OwnerPortalLayout>
  )
}
