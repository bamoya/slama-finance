import { useEffect, useState } from 'react'
import { Link } from 'wouter'

import {
  useOrganizationStaffAcceptInvitation,
  useOrganizationStaffInspectInvitation,
} from '../../../../../api/generated/identity/identity'
import {
  AcceptStaffInvitationInputSchema,
  InspectStaffInvitationInputSchema,
  organizationStaffInspectInvitationParamsSchema,
} from '../../../../../api/generated/schemas/identity/staff-invitations.schemas'
import { AuthForm } from '../../../../../components/auth/auth-form'
import { FormError } from '../../../../../components/management/form-error'
import { buttonVariants } from '../../../../../components/ui/button'
import { translate, useUiLanguage } from '../../../../../lib/i18n'
import { AuthLayout } from '../components/auth-layout'

export function AcceptInvitationPage({ organizationId }: { organizationId: string }) {
  useUiLanguage()
  const [done, setDone] = useState(false)
  const [token] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '',
  )
  const inspect = useOrganizationStaffInspectInvitation({ mutation: { gcTime: 0 } }),
    accept = useOrganizationStaffAcceptInvitation({ mutation: { gcTime: 0 } })
  const { mutate } = inspect
  const valid =
    InspectStaffInvitationInputSchema.safeParse({ token }).success &&
    organizationStaffInspectInvitationParamsSchema.safeParse({ organizationId }).success
  useEffect(() => {
    if (window.location.hash)
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname + window.location.search,
      )
    if (valid) mutate({ organizationId, data: { token } })
  }, [mutate, organizationId, token, valid])
  return (
    <AuthLayout
      brand="platform"
      title={translate(done ? 'Your account is ready' : 'Join your organization')}
      description={
        inspect.data?.organizationName ??
        translate('Accept your personal invitation to create an organization account.')
      }
    >
      {done ? (
        <p role="status">{translate('Your password is saved. Sign in to your organization.')}</p>
      ) : !valid ? (
        <p role="alert">{translate('This invitation link is invalid.')}</p>
      ) : inspect.isPending ? (
        <p role="status">{translate('Loading…')}</p>
      ) : inspect.isError ? (
        <FormError error={inspect.error} />
      ) : inspect.data ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{inspect.data.email}</p>
          <AuthForm
            confirm
            revealPasswords
            fields={[
              {
                name: 'firstName',
                label: translate('First name'),
                type: 'text',
                autoComplete: 'given-name',
              },
              {
                name: 'lastName',
                label: translate('Family name'),
                type: 'text',
                autoComplete: 'family-name',
              },
              {
                name: 'password',
                label: translate('New password'),
                type: 'password',
                autoComplete: 'new-password',
              },
              {
                name: 'confirmation',
                label: translate('Confirm password'),
                type: 'password',
                autoComplete: 'new-password',
              },
            ]}
            schema={{
              safeParse: (value) =>
                AcceptStaffInvitationInputSchema.safeParse({
                  ...(value as Record<string, string>),
                  token,
                }),
            }}
            submitLabel={translate('Accept invitation')}
            onSubmit={async (value) => {
              try {
                await accept.mutateAsync({
                  organizationId,
                  data: AcceptStaffInvitationInputSchema.parse({ ...value, token }),
                })
                setDone(true)
              } finally {
                accept.reset()
              }
            }}
          />
        </div>
      ) : null}
      <Link
        className={buttonVariants({ variant: 'outline', className: 'mt-4 w-full' })}
        href={`/organizations/${organizationId}/login`}
      >
        {translate('Sign in to your organization')}
      </Link>
    </AuthLayout>
  )
}
