import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useLocation } from 'wouter'
import { z } from 'zod'

import {
  getGetAdminSessionQueryKey,
  useAdminLogin,
  useAdminVerifyTwoFactor,
} from '../../../../api/generated/administration/administration'
import type { AdminLoginChallenge } from '../../../../api/generated/models'
import { AdminLoginSchema } from '../../../../api/generated/schemas/administration/administration.schemas'
import { AuthForm } from '../../../../components/auth/auth-form'
import { PlatformBrand } from '../../../../components/branding/platform-brand'
import { ApiError } from '../../../../lib/api-error'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { useTheme } from '../../../../lib/use-theme'
import { adminPaths } from '../admin-paths'
import { QrCode } from '../components/qr-code'

const codeSchema = z.object({
  code: z.string().regex(/^[0-9]{6}$/, 'Enter the 6-digit code from your authenticator app.'),
})

export function AdminLoginPage() {
  useUiLanguage()
  const { isDark } = useTheme()
  const client = useQueryClient()
  const [, navigate] = useLocation()
  const login = useAdminLogin()
  const verify = useAdminVerifyTwoFactor()
  const [challenge, setChallenge] = useState<AdminLoginChallenge | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const enrollment = challenge?.step === 'enroll' ? challenge.enrollment : null
  return (
    <div
      className={`app-canvas grid min-h-dvh place-items-center px-4 py-10 ${isDark ? 'is-dark' : ''}`}
    >
      <section
        aria-labelledby="admin-login-title"
        className="w-full max-w-md space-y-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm"
      >
        <PlatformBrand />
        <div>
          <h1 id="admin-login-title" className="text-xl font-bold">
            {translate(challenge ? 'Two-factor verification' : 'Administrator sign in')}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {translate(
              enrollment
                ? 'Scan the QR code with your authenticator app, then enter the 6-digit code to finish setting up your account.'
                : challenge
                  ? 'Enter the 6-digit code from your authenticator app.'
                  : 'Restricted access for platform administrators.',
            )}
          </p>
        </div>
        {notice && (
          <p role="status" className="text-sm text-[var(--error-text)]">
            {translate(notice)}
          </p>
        )}
        {!challenge ? (
          <AuthForm
            key="credentials"
            schema={AdminLoginSchema}
            submitLabel={translate('Log in')}
            revealPasswords
            fields={[
              {
                name: 'email',
                label: translate('Email address'),
                type: 'email',
                autoComplete: 'username',
              },
              {
                name: 'password',
                label: translate('Password'),
                type: 'password',
                autoComplete: 'current-password',
              },
            ]}
            onSubmit={async (value) => {
              setNotice(null)
              setChallenge(
                await login.mutateAsync({
                  data: { email: value.email ?? '', password: value.password ?? '' },
                }),
              )
            }}
          />
        ) : (
          <>
            {enrollment && (
              <div className="flex flex-col items-center gap-3">
                <QrCode value={enrollment.otpauthUri} label={translate('Authenticator QR code')} />
                <p className="text-center text-sm">
                  {translate('Or enter this key manually:')}{' '}
                  <code className="break-all font-mono font-semibold">{enrollment.secret}</code>
                </p>
              </div>
            )}
            <AuthForm
              key="code"
              schema={codeSchema}
              submitLabel={translate('Verify')}
              fields={[
                {
                  name: 'code',
                  label: translate('Verification code'),
                  type: 'text',
                  autoComplete: 'one-time-code',
                },
              ]}
              onSubmit={async (value) => {
                try {
                  const session = await verify.mutateAsync({ data: { code: value.code ?? '' } })
                  client.setQueryData(getGetAdminSessionQueryKey(), session)
                  navigate(adminPaths.payments, { replace: true })
                } catch (error) {
                  // Five wrong codes revoke the pending session: start over.
                  if (
                    error instanceof ApiError &&
                    error.status === 401 &&
                    error.code !== 'INVALID_CODE'
                  ) {
                    setChallenge(null)
                    setNotice('Your sign-in attempt expired. Log in again.')
                    return
                  }
                  throw error
                }
              }}
            />
          </>
        )}
      </section>
    </div>
  )
}
