import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, Redirect, useLocation } from 'wouter'

import {
  getOrganizationStaffSessionQueryKey,
  useOrganizationStaffChangePassword,
  useOrganizationStaffConfirmReset,
  useOrganizationStaffLogin,
  useOrganizationStaffLogout,
  useOrganizationStaffRequestReset,
  useOrganizationStaffSession,
} from '../../../../../api/generated/identity/identity'
import {
  ChangePasswordSchema,
  LoginSchema,
  PasswordResetConfirmSchema,
  PasswordResetRequestSchema,
} from '../../../../../api/generated/schemas/identity/auth.schemas'
import { organizationStaffLoginParamsSchema } from '../../../../../api/generated/schemas/identity/organization-auth.schemas'
import { openWorkspace } from '../../../../../api/workspace-scope'
import { AuthForm } from '../../../../../components/auth/auth-form'
import { FormError } from '../../../../../components/management/form-error'
import { Button, buttonVariants } from '../../../../../components/ui/button'
import { translate, useUiLanguage } from '../../../../../lib/i18n'
import { AuthLayout } from '../components/auth-layout'

type Mode = 'login' | 'forgot' | 'reset' | 'password' | 'account'
export function OrganizationStaffAuthPage({
  organizationId,
  mode,
}: {
  organizationId: string
  mode: Mode
}) {
  useUiLanguage()
  const client = useQueryClient()
  const [, navigate] = useLocation()
  const base = `/organizations/${organizationId}`
  const valid = organizationStaffLoginParamsSchema.safeParse({ organizationId }).success
  const login = useOrganizationStaffLogin()
  const logout = useOrganizationStaffLogout()
  const request = useOrganizationStaffRequestReset()
  const reset = useOrganizationStaffConfirmReset()
  const change = useOrganizationStaffChangePassword()
  const session = useOrganizationStaffSession(organizationId, {
    query: {
      enabled: valid && (mode === 'account' || mode === 'password'),
      retry: false,
      staleTime: 0,
    },
  })
  const [done, setDone] = useState(false)
  const [token] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '',
  )
  useEffect(() => {
    if (mode === 'reset' && window.location.hash)
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname + window.location.search,
      )
  }, [mode])
  if (!valid) return <p role="alert">{translate('Organization not found.')}</p>
  if ((mode === 'account' || mode === 'password') && session.error?.status === 401)
    return <Redirect to={`${base}/login`} />
  if (mode === 'account' && session.data?.purpose === 'password_change')
    return <Redirect to={`${base}/set-password`} />
  const email = {
    name: 'email',
    label: translate('Email address'),
    type: 'email' as const,
    autoComplete: 'username',
  }
  const password = {
    name: 'password',
    label: translate('Password'),
    type: 'password' as const,
    autoComplete: mode === 'login' ? 'current-password' : 'new-password',
  }
  const confirmation = {
    name: 'confirmation',
    label: translate('Confirm password'),
    type: 'password' as const,
    autoComplete: 'new-password',
  }
  const current = {
    name: 'currentPassword',
    label: translate('Current password'),
    type: 'password' as const,
    autoComplete: 'current-password',
  }
  const next = {
    name: 'newPassword',
    label: translate('New password'),
    type: 'password' as const,
    autoComplete: 'new-password',
  }
  const schema =
    mode === 'login'
      ? LoginSchema
      : mode === 'reset'
        ? {
            safeParse: (v: unknown) =>
              PasswordResetConfirmSchema.safeParse({ ...(v as Record<string, unknown>), token }),
          }
        : mode === 'password'
          ? ChangePasswordSchema
          : PasswordResetRequestSchema
  return (
    <AuthLayout
      title={translate(
        mode === 'account'
          ? 'Staff account'
          : mode === 'login'
            ? 'Staff sign in'
            : mode === 'password'
              ? 'Change password'
              : mode === 'reset'
                ? 'Choose a new password'
                : 'Forgot your password?',
      )}
      description={translate('Use the staff account created for this organization.')}
    >
      {mode === 'account' || mode === 'password' ? (
        <FormError error={session.error ?? logout.error} />
      ) : null}
      {(mode === 'account' || mode === 'password') && session.isPending ? (
        <p role="status">{translate('Loading…')}</p>
      ) : mode === 'account' && session.data ? (
        <>
          <p className="mb-6 break-words">{session.data.user.email}</p>
          <div className="flex flex-wrap gap-3">
            <Link
              className={buttonVariants({ variant: 'outline' })}
              href={`${base}/change-password`}
            >
              {translate('Change password')}
            </Link>
            <Button
              disabled={logout.isPending}
              onClick={async () => {
                try {
                  await logout.mutateAsync({ organizationId })
                  client.removeQueries({
                    queryKey: getOrganizationStaffSessionQueryKey(organizationId),
                  })
                  navigate(`${base}/login`)
                } catch {
                  /* Shown by FormError. */
                }
              }}
            >
              {translate('Log out')}
            </Button>
          </div>
        </>
      ) : done ? (
        <p role="status">
          {translate(
            mode === 'reset'
              ? 'Password updated. Sign in with your new password.'
              : 'If the account is eligible, an email will arrive shortly. Check your inbox and spam folder.',
          )}
        </p>
      ) : mode === 'reset' && !token ? (
        <p role="status">{translate('This link is incomplete. Request a new email below.')}</p>
      ) : (
        mode !== 'account' && (
          <AuthForm
            key={mode}
            schema={schema}
            confirm={mode === 'reset' || mode === 'password'}
            submitLabel={translate(
              mode === 'login' ? 'Log in' : mode === 'forgot' ? 'Send reset link' : 'Save password',
            )}
            fields={
              mode === 'login'
                ? [email, password]
                : mode === 'forgot'
                  ? [email]
                  : mode === 'reset'
                    ? [password, confirmation]
                    : [...(session.data?.purpose === 'full' ? [current] : []), next, confirmation]
            }
            onSubmit={async (value) => {
              if (mode === 'login' || mode === 'password') {
                const result =
                  mode === 'login'
                    ? await login.mutateAsync({ organizationId, data: LoginSchema.parse(value) })
                    : await change.mutateAsync({
                        organizationId,
                        data: ChangePasswordSchema.parse(value),
                      })
                client.setQueryData(getOrganizationStaffSessionQueryKey(organizationId), result)
                if (result.purpose === 'full') openWorkspace(organizationId, 'staff')
                else navigate(`${base}/set-password`)
              } else if (mode === 'forgot') {
                await request.mutateAsync({
                  organizationId,
                  data: PasswordResetRequestSchema.parse(value),
                })
                setDone(true)
              } else {
                await reset.mutateAsync({
                  organizationId,
                  data: PasswordResetConfirmSchema.parse({ ...value, token }),
                })
                client.removeQueries({
                  queryKey: getOrganizationStaffSessionQueryKey(organizationId),
                })
                setDone(true)
              }
            }}
          />
        )
      )}
      {mode !== 'account' && mode !== 'password' && (
        <nav className="mt-6 flex flex-wrap justify-center gap-4 text-sm">
          {mode === 'login' ? (
            <Link className="underline" href={`${base}/forgot-password`}>
              {translate('Forgot your password?')}
            </Link>
          ) : (
            <Link className="underline" href={`${base}/login`}>
              {translate('Back to login')}
            </Link>
          )}
        </nav>
      )}
    </AuthLayout>
  )
}
