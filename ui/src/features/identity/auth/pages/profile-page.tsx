import { useQueryClient } from '@tanstack/react-query'
import { KeyRound, Pencil } from 'lucide-react'
import { Link, useLocation } from 'wouter'

import { UpdateProfileSchema } from '../../../../api/generated/schemas/identity/auth.schemas'
import { MoreAction, MoreActions } from '../../../../components/management/more-actions'
import { PageHeader } from '../../../../components/management/page-header'
import { TextRecordForm } from '../../../../components/management/text-record-form'
import { buttonVariants } from '../../../../components/ui/button'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { refreshIdentity } from '../../shared/queries'
import { useAuthActions } from '../hooks/use-auth-actions'
import { sessionKey, useSession } from '../hooks/use-session'

export function ProfilePage({ editing = false }: { editing?: boolean }) {
  useUiLanguage()

  const { updateProfile } = useAuthActions()
  const session = useSession()
  const cache = useQueryClient()
  const [, navigate] = useLocation()
  const user = session.data?.user
  if (!user) return null
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <PageHeader
        eyebrow={translate('My account')}
        title={editing ? translate('Edit my profile') : translate('My profile')}
        description={translate('Manage your personal details and account security.')}
        actions={
          editing ? undefined : (
            <>
              <Link href="/profile/edit" className={buttonVariants({})}>
                <Pencil data-icon="inline-start" aria-hidden="true" />
                {translate('Edit profile')}
              </Link>
              <MoreActions>
                <MoreAction
                  label={translate('Change password')}
                  icon={<KeyRound />}
                  href="/profile/change-password"
                />
              </MoreActions>
            </>
          )
        }
      />
      <section className="rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
        {editing ? (
          <TextRecordForm
            key={user.id}
            initial={{
              firstName: user.firstName ?? '',
              lastName: user.lastName ?? '',
              email: user.email,
            }}
            fields={[
              { name: 'firstName', label: translate('First name') },
              { name: 'lastName', label: translate('Family name') },
              { name: 'email', label: translate('Email address'), type: 'email' },
              {
                name: 'currentPassword',
                label: translate('Current password'),
                type: 'password',
                get hint() {
                  return translate('Confirm your password to save personal account changes.')
                },
              },
            ]}
            schema={UpdateProfileSchema}
            submitLabel={translate('Save profile')}
            cancelHref="/profile"
            onSubmit={async (value) => {
              const updated = await updateProfile(UpdateProfileSchema.parse(value))
              await cache.cancelQueries({ queryKey: sessionKey })
              cache.setQueryData(sessionKey, updated)
              await refreshIdentity(cache)
              navigate('/profile')
            }}
          />
        ) : (
          <dl className="grid gap-section sm:grid-cols-2">
            {[
              ['First name', user.firstName],
              ['Family name', user.lastName],
              ['Email address', user.email],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-sm text-[var(--muted)]">{translate(label ?? '')}</dt>
                <dd className="mt-2 font-semibold">{value || '—'}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    </div>
  )
}
