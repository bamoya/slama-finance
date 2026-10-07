import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link } from 'wouter'

import { PasswordResetConfirmSchema } from '../../../../api/generated/schemas/identity/auth.schemas'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { AuthForm } from '../components/auth-form'
import { AuthLayout } from '../components/auth-layout'
import { useAuthActions } from '../hooks/use-auth-actions'
import { sessionKey } from '../hooks/use-session'
export function ResetPasswordPage() {
  useUiLanguage()

  const { confirmPasswordReset } = useAuthActions()
  const [token] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '',
  )
  const [done, setDone] = useState(false)
  const client = useQueryClient()
  useEffect(() => {
    window.history.replaceState(window.history.state, '', window.location.pathname)
  }, [])
  const valid = PasswordResetConfirmSchema.shape.token.safeParse(token).success
  return (
    <AuthLayout
      title={done ? translate('Password updated') : translate('Choose a new password')}
      description={translate('Use a unique password with at least 12 characters.')}
    >
      {done ? (
        <p role="status">
          {translate('Your password has been reset. Sign in with your new password.')}
        </p>
      ) : !valid ? (
        <p role="alert">
          {translate('This reset link is missing or invalid. Request a new link below.')}
        </p>
      ) : (
        <AuthForm
          schema={{
            safeParse: (value) =>
              PasswordResetConfirmSchema.safeParse({ ...(value as object), token }),
          }}
          confirm
          submitLabel={translate('Reset password')}
          fields={[
            { name: 'password', label: translate('New password'), autoComplete: 'new-password' },
            {
              name: 'confirmation',
              label: translate('Confirm new password'),
              autoComplete: 'new-password',
            },
          ]}
          onSubmit={async (value) => {
            await confirmPasswordReset(PasswordResetConfirmSchema.parse({ ...value, token }))
            await client.cancelQueries()
            client.clear()
            client.setQueryData(sessionKey, null)
            setDone(true)
          }}
        />
      )}
      <Link
        href={done ? '/login' : '/forgot-password'}
        className="mt-6 block text-center underline"
      >
        {done ? translate('Back to login') : translate('Request a new reset link')}
      </Link>
    </AuthLayout>
  )
}
