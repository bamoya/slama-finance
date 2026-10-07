import { Link, Redirect } from 'wouter'

import { LoginSchema } from '../../../../api/generated/schemas/identity/auth.schemas'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { useAuthActions } from '../hooks/use-auth-actions'
import { useAuthTransition, useSession } from '../hooks/use-session'
import { AuthForm } from './auth-form'
import { AuthLayout } from './auth-layout'
import { SessionStatus } from './session-status'
export function LoginPage() {
  useUiLanguage()

  const { login } = useAuthActions()
  const session = useSession()
  const transition = useAuthTransition()
  if (session.isPending || session.isError) return <SessionStatus />
  if (session.data)
    return (
      <Redirect to={session.data.purpose === 'password_change' ? '/set-password' : '/dashboard'} />
    )
  return (
    <AuthLayout
      title={translate('Welcome back.')}
      description={translate('Use the account created for you by your administrator.')}
    >
      <AuthForm
        schema={LoginSchema}
        submitLabel={translate('Log in')}
        fields={[
          {
            name: 'email',
            label: translate('Email address'),
            type: 'email',
            autoComplete: 'username',
          },
          { name: 'password', label: translate('Password'), autoComplete: 'current-password' },
        ]}
        onSubmit={async (value) => transition(await login(LoginSchema.parse(value)))}
      />
      <Link href="/forgot-password" className="mt-6 block text-center underline">
        {translate('Forgot your password?')}
      </Link>
      <p className="mt-8 text-center text-sm text-[var(--muted)]">
        {translate('Need access? Contact your administrator.')}
      </p>
    </AuthLayout>
  )
}
