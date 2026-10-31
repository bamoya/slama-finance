import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useLocation } from 'wouter'

import {
  getGetAdminSessionQueryKey,
  useAdminLogin,
  useAdminVerifyTwoFactor,
} from '../../../../../api/generated/administration/administration'
import type { AdminLoginChallenge } from '../../../../../api/generated/models'
import { ApiError } from '../../../../../lib/api-error'
import { translate, useUiLanguage } from '../../../../../lib/i18n'
import { adminPaths } from '../../shared/admin-paths'
import { CodeForm } from '../components/code-form'
import { CredentialsForm } from '../components/credentials-form'
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
                navigate(adminPaths.overview, { replace: true })
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
    </SignInLayout>
  )
}
