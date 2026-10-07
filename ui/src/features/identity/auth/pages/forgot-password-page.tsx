import { useState } from 'react'
import { Link } from 'wouter'

import { PasswordResetRequestSchema } from '../../../../api/generated/schemas/identity/auth.schemas'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { AuthForm } from '../components/auth-form'
import { AuthLayout } from '../components/auth-layout'
import { useAuthActions } from '../hooks/use-auth-actions'
export function ForgotPasswordPage() {
  useUiLanguage()

  const { requestPasswordReset } = useAuthActions()
  const [sent, setSent] = useState(false)
  return (
    <AuthLayout
      title={translate('Forgot your password?')}
      description={translate('Enter your company account email to request a reset link.')}
    >
      {sent ? (
        <p role="status">
          {translate(
            'If the account is eligible, a reset link will arrive by email. Check your inbox and spam folder. The link expires in 15 minutes.',
          )}
        </p>
      ) : (
        <AuthForm
          schema={PasswordResetRequestSchema}
          submitLabel={translate('Send reset link')}
          fields={[
            {
              name: 'email',
              label: translate('Email address'),
              type: 'email',
              autoComplete: 'email',
            },
          ]}
          onSubmit={async (value) => {
            await requestPasswordReset(PasswordResetRequestSchema.parse(value))
            setSent(true)
          }}
        />
      )}
      <Link href="/login" className="mt-6 block text-center underline">
        {translate('Back to login')}
      </Link>
    </AuthLayout>
  )
}
