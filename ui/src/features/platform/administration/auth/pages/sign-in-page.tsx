import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useLocation } from 'wouter'

import {
  getGetAdminSessionQueryKey,
  useAdminLogin,
  useAdminVerifyTwoFactor,
} from '../../../../../api/generated/administration/administration'
import type { AdminLoginChallenge } from '../../../../../api/generated/models'
import { PlatformBrand } from '../../../../../components/branding/platform-brand'
import { ApiError } from '../../../../../lib/api-error'
import { translate, useUiLanguage } from '../../../../../lib/i18n'
import { useTheme } from '../../../../../lib/use-theme'
import { adminPaths } from '../../shared/admin-paths'
import { CodeForm } from '../components/code-form'
import { CredentialsForm } from '../components/credentials-form'
import { TotpEnrollment } from '../components/totp-enrollment'

export function AdminSignInPage() {
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
          <CredentialsForm
            key="credentials"
            onSubmit={async (value) => {
              setNotice(null)
              setChallenge(await login.mutateAsync({ data: value }))
            }}
          />
        ) : (
          <>
            {enrollment && (
              <TotpEnrollment otpauthUri={enrollment.otpauthUri} secret={enrollment.secret} />
            )}
            <CodeForm
              key="code"
              onSubmit={async (code) => {
                try {
                  const session = await verify.mutateAsync({ data: { code } })
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
