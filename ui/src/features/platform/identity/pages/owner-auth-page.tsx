import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useLocation, useSearch } from 'wouter'

import {
  getGetOwnerSessionQueryKey,
  useConfirmOwnerPasswordReset,
  useConfirmOwnerVerification,
  useLoginOwner,
  useRegisterOwner,
  useRequestOwnerPasswordReset,
  useRequestOwnerVerification,
} from '../../../../api/generated/identity/identity'
import {
  OwnerEmailRequestSchema,
  OwnerLoginSchema,
  OwnerRegisterSchema,
  OwnerResetPasswordSchema,
} from '../../../../api/generated/schemas/identity/owner-auth.schemas'
import { AuthForm } from '../../../../components/auth/auth-form'
import { FormError } from '../../../../components/management/form-error'
import { Button } from '../../../../components/ui/button'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { ownerAuthPaths } from '../../../../lib/public-paths'
import { clearOwnerQueries } from '../../shared/api/owner-cache'
import { OwnerAuthLayout } from '../components/owner-auth-layout'

type Mode = 'login' | 'register' | 'forgot' | 'reset' | 'verify' | 'resend'
const titles: Record<Mode, string> = {
  login: 'Owner sign in',
  register: 'Create your owner account',
  forgot: 'Reset your owner password',
  reset: 'Choose a new owner password',
  verify: 'Verify your owner email',
  resend: 'Resend verification email',
}
export function OwnerAuthPage({ mode }: { mode: Mode }) {
  const language = useUiLanguage()
  const [, navigate] = useLocation()
  const search = useSearch()
  const client = useQueryClient()
  const login = useLoginOwner()
  const register = useRegisterOwner()
  const requestReset = useRequestOwnerPasswordReset()
  const requestVerification = useRequestOwnerVerification()
  const reset = useConfirmOwnerPasswordReset()
  const verify = useConfirmOwnerVerification()
  const [done, setDone] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [token] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '',
  )
  useEffect(() => {
    if ((mode === 'verify' || mode === 'reset') && window.location.hash) {
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname + window.location.search,
      )
    }
  }, [mode])
  const firstNameField = {
    name: 'firstName',
    label: translate('First name'),
    type: 'text' as const,
    autoComplete: 'given-name',
    half: true,
  }
  const lastNameField = {
    name: 'lastName',
    label: translate('Last name'),
    type: 'text' as const,
    autoComplete: 'family-name',
    half: true,
  }
  const emailField = {
    name: 'email',
    label: translate('Email address'),
    type: 'email' as const,
    autoComplete: 'email',
  }
  const passwordField = {
    name: 'password',
    label: translate('Password'),
    type: 'password' as const,
    autoComplete: mode === 'login' ? 'current-password' : 'new-password',
  }
  const confirmationField = {
    name: 'confirmation',
    label: translate('Confirm password'),
    type: 'password' as const,
    autoComplete: 'new-password',
  }
  const schema =
    mode === 'login'
      ? OwnerLoginSchema
      : mode === 'register'
        ? OwnerRegisterSchema
        : mode === 'reset'
          ? {
              safeParse: (value: unknown) =>
                OwnerResetPasswordSchema.safeParse({
                  ...(value as Record<string, unknown>),
                  token,
                }),
            }
          : OwnerEmailRequestSchema
  return (
    <OwnerAuthLayout
      mode={mode}
      title={translate(titles[mode])}
      description={translate('Manage your organizations with your independent owner account.')}
    >
      {mode === 'login' && new URLSearchParams(search).get('invitation') === 'accepted' && (
        <p
          role="status"
          className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--accent-soft)] p-3 text-sm"
        >
          {translate('Your account is active. Sign in with your new password.')}
        </p>
      )}
      <FormError error={error} />
      {done ? (
        <p role="status" className="mb-6 text-sm">
          {translate(
            mode === 'verify'
              ? 'Email verified. You can now sign in.'
              : mode === 'reset'
                ? 'Password updated. Sign in with your new password.'
                : 'If the account is eligible, an email will arrive shortly. Check your inbox and spam folder.',
          )}
        </p>
      ) : (mode === 'verify' || mode === 'reset') && !token ? (
        <p role="status">{translate('This link is incomplete. Request a new email below.')}</p>
      ) : mode === 'verify' ? (
        <Button
          disabled={verify.isPending}
          onClick={async () => {
            setError(null)
            try {
              await verify.mutateAsync({ data: { token } })
              setDone(true)
            } catch (reason) {
              setError(reason)
            }
          }}
        >
          {translate('Verify email')}
        </Button>
      ) : (
        <AuthForm
          key={mode}
          revealPasswords
          schema={schema}
          confirm={mode === 'register' || mode === 'reset'}
          submitLabel={translate(
            mode === 'login'
              ? 'Log in'
              : mode === 'register'
                ? 'Create account'
                : mode === 'reset'
                  ? 'Save password'
                  : 'Send email',
          )}
          fields={
            mode === 'reset'
              ? [passwordField, confirmationField]
              : mode === 'login' || mode === 'register'
                ? [
                    ...(mode === 'register' ? [firstNameField, lastNameField] : []),
                    emailField,
                    passwordField,
                    ...(mode === 'register' ? [confirmationField] : []),
                  ]
                : [emailField]
          }
          onSubmit={async (value) => {
            if (mode === 'login') {
              const session = await login.mutateAsync({ data: OwnerLoginSchema.parse(value) })
              await clearOwnerQueries(client)
              client.setQueryData(getGetOwnerSessionQueryKey(), session)
              navigate('/owner')
            } else if (mode === 'register') {
              await register.mutateAsync({
                data: OwnerRegisterSchema.parse({
                  ...value,
                  locale: language === 'en' ? 'en' : 'fr',
                }),
              })
              setDone(true)
            } else if (mode === 'reset') {
              await reset.mutateAsync({ data: OwnerResetPasswordSchema.parse({ ...value, token }) })
              client.removeQueries({ queryKey: getGetOwnerSessionQueryKey() })
              setDone(true)
            } else {
              const data = OwnerEmailRequestSchema.parse(value)
              if (mode === 'resend') await requestVerification.mutateAsync({ data })
              else await requestReset.mutateAsync({ data })
              setDone(true)
            }
          }}
        />
      )}
      <nav aria-label={translate('Owner account')} className="owner-auth-links">
        {mode !== 'login' && (
          <Link href={ownerAuthPaths.login} className="underline">
            {translate('Owner sign in')}
          </Link>
        )}
        {mode === 'login' && (
          <>
            <Link href={ownerAuthPaths.forgot} className="underline">
              {translate('Forgot your password?')}
            </Link>
          </>
        )}
        {(mode === 'login' || mode === 'verify' || mode === 'register') && (
          <Link href={ownerAuthPaths.resend} className="underline">
            {translate('Resend verification email')}
          </Link>
        )}
        {mode === 'reset' && (
          <Link href={ownerAuthPaths.forgot} className="underline">
            {translate('Send reset link')}
          </Link>
        )}
      </nav>
    </OwnerAuthLayout>
  )
}
