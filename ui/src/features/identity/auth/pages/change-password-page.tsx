import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Redirect, useLocation } from 'wouter'

import { ChangePasswordSchema } from '../../../../api/generated/schemas/identity/auth.schemas'
import { PageHeader } from '../../../../components/management/page-header'
import { buttonVariants } from '../../../../components/ui/button'
import { ApiError } from '../../../../lib/api-error'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { AuthForm } from '../components/auth-form'
import { AuthLayout } from '../components/auth-layout'
import { LogoutButton } from '../components/logout-button'
import { SessionStatus } from '../components/session-status'
import { useAuthActions } from '../hooks/use-auth-actions'
import { useAuthTransition, useSession } from '../hooks/use-session'
function ProfilePasswordLayout({
  title,
  description,
  children,
}: ComponentProps<typeof AuthLayout>) {
  useUiLanguage()

  const { t } = useTranslation('pageActions')
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <PageHeader
        title={title}
        description={description}
        actions={
          <Link href="/profile" className={buttonVariants({ variant: 'outline' })}>
            {t('cancel')}
          </Link>
        }
      />
      <section className="rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
        <div className="max-w-xl">{children}</div>
      </section>
    </div>
  )
}
export function ChangePasswordPage({ embedded = false }: { embedded?: boolean }) {
  useUiLanguage()

  const { changePassword } = useAuthActions()
  const session = useSession()
  const transition = useAuthTransition()
  const [pathname, navigate] = useLocation()
  if (session.isPending || session.isError) return <SessionStatus />
  if (!session.data) return <Redirect to="/login" />
  const restricted = session.data.purpose === 'password_change'
  if (!embedded && !restricted && pathname === '/set-password')
    return <Redirect to="/profile/change-password" replace />
  const Layout = embedded ? ProfilePasswordLayout : AuthLayout
  return (
    <Layout
      title={restricted ? translate('Set your own password') : translate('Change your password')}
      description={
        restricted
          ? translate(
              'Your temporary password has been used. Choose a new password to unlock your account. This session expires after 15 minutes.',
            )
          : translate(
              'Choose a unique password with at least 12 characters. Other sessions will be signed out.',
            )
      }
    >
      <AuthForm
        headerActions={embedded}
        key={session.data.purpose}
        schema={ChangePasswordSchema}
        confirm
        submitLabel={translate('Save new password')}
        fields={[
          ...(!restricted
            ? [
                {
                  name: 'currentPassword',
                  label: translate('Current password'),
                  autoComplete: 'current-password',
                },
              ]
            : []),
          { name: 'newPassword', label: translate('New password'), autoComplete: 'new-password' },
          {
            name: 'confirmation',
            label: translate('Confirm new password'),
            autoComplete: 'new-password',
          },
        ]}
        onSubmit={async (value) => {
          if (!restricted && !value.currentPassword)
            throw new ApiError(400, 'CURRENT_PASSWORD_REQUIRED', 'Enter your current password.')
          try {
            await transition(await changePassword(ChangePasswordSchema.parse(value)))
            if (embedded) navigate('/profile', { replace: true })
          } catch (error) {
            if (error instanceof ApiError && error.status === 401) await transition(null)
            else throw error
          }
        }}
      />
      {!embedded && (
        <div className="mt-6 flex items-center justify-between">
          {!restricted && (
            <Link href="/profile" className="underline">
              {translate('Back to profile')}
            </Link>
          )}
          <LogoutButton />
        </div>
      )}
      {restricted && (
        <p className="mt-6 text-sm text-[var(--muted)]">
          {translate(
            'If this session expires, use password recovery or ask your administrator for a new temporary password.',
          )}
        </p>
      )}
    </Layout>
  )
}
