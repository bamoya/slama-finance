import { FormError } from '../../../../components/management/form-error'
import { PageHeader } from '../../../../components/management/page-header'
import { Button } from '../../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { OwnerPortalLayout } from '../../shared/components/owner-portal-layout'
import { useOwnerLogout } from '../../shared/hooks/use-owner-logout'
import { useOwnerAccount } from '../hooks/use-owner-account'

function OwnerProfile() {
  useUiLanguage()
  const owner = useOwnerAccount()
  const logout = useOwnerLogout()
  return (
    <>
      <PageHeader
        brandName="B-Finance"
        eyebrow={translate('Owner portal')}
        title={translate('Owner account')}
        description={translate('Manage your organizations with your independent owner account.')}
        backHref="/"
      />
      <Card>
        <CardHeader>
          <CardTitle>{translate('Account details')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <dl className="grid gap-5 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-[var(--muted)]">{translate('Email address')}</dt>
              <dd className="mt-1 break-words font-medium">{owner.email}</dd>
            </div>
            <div>
              <dt className="text-sm text-[var(--muted)]">{translate('Language')}</dt>
              <dd className="mt-1">{owner.locale === 'fr' ? 'Français' : 'English'}</dd>
            </div>
          </dl>
          <FormError error={logout.error} />
          <Button
            disabled={logout.isPending}
            onClick={() => {
              void logout.logout().catch(() => {})
            }}
          >
            {translate('Log out')}
          </Button>
        </CardContent>
      </Card>
    </>
  )
}
export function OwnerAccountPage() {
  return (
    <OwnerPortalLayout>
      <OwnerProfile />
    </OwnerPortalLayout>
  )
}
