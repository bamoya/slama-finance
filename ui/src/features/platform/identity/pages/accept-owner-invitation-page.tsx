import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'wouter'

import {
  acceptOwnerInvitation,
  inspectOwnerInvitation,
} from '../../../../api/generated/identity/identity'
import type { OwnerInvitation } from '../../../../api/generated/models'
import {
  OwnerResetPasswordSchema,
  OwnerTokenSchema,
} from '../../../../api/generated/schemas/identity/owner-auth.schemas'
import { AuthForm } from '../../../../components/auth/auth-form'
import { FormError } from '../../../../components/management/form-error'
import { Input } from '../../../../components/ui/input'
import { Label } from '../../../../components/ui/label'
import { ApiError } from '../../../../lib/api-error'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { ownerAuthPaths } from '../../../../lib/public-paths'
import { OwnerAuthLayout } from '../components/owner-auth-layout'

type State =
  | { step: 'loading' }
  | { step: 'invalid' }
  | { step: 'failed'; error: unknown }
  | { step: 'ready'; invitation: OwnerInvitation }

/** The token travels in the URL fragment so it never reaches server logs; read it once, then hide it. */
function readToken() {
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? ''
  if (window.location.hash)
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname + window.location.search,
    )
  return token
}

export function AcceptOwnerInvitationPage() {
  useUiLanguage()
  const [, navigate] = useLocation()
  const [token] = useState(readToken)
  const [state, setState] = useState<State>(() =>
    OwnerTokenSchema.safeParse({ token }).success ? { step: 'loading' } : { step: 'invalid' },
  )
  const inspected = useRef(false)
  useEffect(() => {
    if (state.step !== 'loading' || inspected.current) return
    inspected.current = true
    inspectOwnerInvitation({ token }).then(
      (invitation) => setState({ step: 'ready', invitation }),
      (error: unknown) =>
        setState(
          error instanceof ApiError && (error.status === 400 || error.status === 404)
            ? { step: 'invalid' }
            : { step: 'failed', error },
        ),
    )
  }, [state.step, token])
  const invitation = state.step === 'ready' ? state.invitation : null
  return (
    <OwnerAuthLayout
      mode="invitation"
      title={
        invitation
          ? translate('Welcome {{name}}', { name: invitation.firstName ?? invitation.email })
          : translate('Activate your owner account')
      }
      description={translate('Choose a password to activate your account.')}
    >
      {state.step === 'loading' && <p role="status">{translate('Checking your invitation…')}</p>}
      {state.step === 'failed' && <FormError error={state.error} />}
      {state.step === 'invalid' && (
        <div role="alert" className="space-y-3 text-sm">
          <p className="font-semibold">{translate('This invitation link is not valid.')}</p>
          <p>
            {translate(
              'It may have expired or already been used. Ask your administrator to send you a new invitation.',
            )}
          </p>
          <Link href={ownerAuthPaths.login} className="underline">
            {translate('Owner sign in')}
          </Link>
        </div>
      )}
      {invitation && (
        <>
          <div className="mb-4 space-y-2">
            <Label htmlFor="invitation-email">{translate('Email address')}</Label>
            <Input id="invitation-email" type="email" value={invitation.email} readOnly />
          </div>
          <AuthForm
            revealPasswords
            confirm
            schema={{
              safeParse: (value) =>
                OwnerResetPasswordSchema.safeParse({
                  ...(value as Record<string, unknown>),
                  token,
                }),
            }}
            submitLabel={translate('Activate account')}
            fields={[
              {
                name: 'password',
                label: translate('Password'),
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
            onSubmit={async (value) => {
              try {
                await acceptOwnerInvitation({ token, password: value.password ?? '' })
              } catch (error) {
                if (error instanceof ApiError && error.code === 'INVALID_INVITATION_TOKEN')
                  setState({ step: 'invalid' })
                throw error
              }
              navigate(`${ownerAuthPaths.login}?invitation=accepted`, { replace: true })
            }}
          />
        </>
      )}
    </OwnerAuthLayout>
  )
}
