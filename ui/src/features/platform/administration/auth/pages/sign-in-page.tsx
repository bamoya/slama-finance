import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useLocation } from 'wouter'

import {
  getGetAdminSessionQueryKey,
  recoverAdminSignIn,
  useAdminLogin,
  useAdminVerifyTwoFactor,
} from '../../../../../api/generated/administration/administration'
import type { AdminLoginChallenge, AdminSession } from '../../../../../api/generated/models'
import { Button } from '../../../../../components/ui/button'
import { ApiError } from '../../../../../lib/api-error'
import { translate, useUiLanguage } from '../../../../../lib/i18n'
import { adminPaths } from '../../shared/admin-paths'
import { CodeForm } from '../components/code-form'
import { CredentialsForm } from '../components/credentials-form'
import { PasskeyLoginButton } from '../components/passkey-login-button'
import { RecoveryCodeForm } from '../components/recovery-code-form'
import { SignInLayout } from '../components/sign-in-layout'
import { TotpEnrollment } from '../components/totp-enrollment'

export function AdminSignInPage() {
  useUiLanguage()
  const client = useQueryClient()
  const [, navigate] = useLocation()
  const login = useAdminLogin()
  const verify = useAdminVerifyTwoFactor()
  const [challenge, setChallenge] = useState<AdminLoginChallenge | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [recovery, setRecovery] = useState(false)
  const finish = (session: AdminSession) => {
    client.setQueryData(getGetAdminSessionQueryKey(), session)
    navigate(adminPaths.overview, { replace: true })
  }
  // Five wrong codes revoke the pending session: start over.
  const restartIfExpired = (error: unknown) => {
    if (error instanceof ApiError && error.status === 401 && error.code !== 'INVALID_CODE') {
      setChallenge(null)
      setRecovery(false)
      setNotice('Your sign-in attempt expired. Log in again.')
      return true
    }
    return false
  }
  const enrollment = challenge?.step === 'enroll' ? challenge.enrollment : null
  return (
    <SignInLayout
      title={translate('Sign in')}
      description={translate(
        enrollment
          ? 'Scan the QR code with your authenticator app, then enter the 6-digit code to finish setting up your account.'
          : '',
      )}
    >
      {notice && (
        <p role="status" className="admin-auth-notice">
          {translate(notice)}
        </p>
      )}
      {!challenge ? (
        <div className="space-y-content">
          <CredentialsForm
            key="credentials"
            onSubmit={async (value) => {
              setNotice(null)
              setChallenge(await login.mutateAsync({ data: value }))
            }}
          />
          <PasskeyLoginButton onSession={finish} />
        </div>
      ) : (
        <>
          {enrollment && (
            <TotpEnrollment otpauthUri={enrollment.otpauthUri} secret={enrollment.secret} />
          )}
          {recovery ? (
            <RecoveryCodeForm
              key="recovery"
              onBack={() => setRecovery(false)}
              onSubmit={async (recoveryCode) => {
                try {
                  finish(await recoverAdminSignIn({ recoveryCode }))
                } catch (error) {
                  if (!restartIfExpired(error)) throw error
                }
              }}
            />
          ) : (
            <>
              <CodeForm
                key="code"
                onSubmit={async (code) => {
                  try {
                    finish(await verify.mutateAsync({ data: { code } }))
                  } catch (error) {
                    if (!restartIfExpired(error)) throw error
                  }
                }}
              />
              {!enrollment && (
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-3 w-full"
                  onClick={() => setRecovery(true)}
                >
                  {translate('Use a recovery code')}
                </Button>
              )}
            </>
          )}
        </>
      )}
    </SignInLayout>
  )
}
