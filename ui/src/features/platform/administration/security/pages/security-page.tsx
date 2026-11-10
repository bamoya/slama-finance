import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useLocation } from 'wouter'

import {
  getGetAdminSecurityQueryKey,
  regenerateAdminRecoveryCodes,
  registerAdminPasskey,
  startAdminPasskeyRegistration,
  useGetAdminSecurity,
} from '../../../../../api/generated/administration/administration'
import type { AdminTotpEnrollment } from '../../../../../api/generated/models'
import { FormError } from '../../../../../components/management/form-error'
import { RequestState } from '../../../../../components/management/request-state'
import { Button } from '../../../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../../../components/ui/card'
import { Input } from '../../../../../components/ui/input'
import { Label } from '../../../../../components/ui/label'
import { ApiError } from '../../../../../lib/api-error'
import { translate, useUiLanguage } from '../../../../../lib/i18n'
import { usePasskeyCeremony } from '../../auth/hooks/use-passkey-ceremony'
import { adminPaths } from '../../shared/admin-paths'
import { AdministrationLayout } from '../../shared/components/administration-layout'
import { AdministrationPageHeader } from '../../shared/components/administration-page-header'
import { isAdminKey } from '../../shared/hooks/use-signed-out-on-unauthorized'
import { PasskeyList } from '../components/passkey-list'
import { ReauthenticationDialog } from '../components/reauthentication-dialog'
import { RecoveryCodesDialog } from '../components/recovery-codes-dialog'
import { TotpReplacementPanel } from '../components/totp-replacement'
import { useReauthenticatedAction } from '../hooks/use-reauthenticated-action'

const maxPasskeys = 10

export function AdminSecurityPage() {
  useUiLanguage()
  const client = useQueryClient()
  const [, navigate] = useLocation()
  const query = useGetAdminSecurity({ query: { retry: false } })
  const passkey = usePasskeyCeremony()
  const reauth = useReauthenticatedAction()
  const [name, setName] = useState('')
  const [nameMissing, setNameMissing] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [codes, setCodes] = useState<string[] | null>(null)
  const [enrollment, setEnrollment] = useState<AdminTotpEnrollment | null>(null)
  const refresh = () => client.invalidateQueries({ queryKey: getGetAdminSecurityQueryKey() })
  const signOut = () => {
    setCodes(null)
    setEnrollment(null)
    client.removeQueries({ predicate: (item) => isAdminKey(item.queryKey) })
    navigate(adminPaths.login, { replace: true })
  }
  /** Session loss signs out (clearing cached data and shown secrets); anything else is rethrown. */
  const signOutOnUnauthorized = (failure: unknown) => {
    if (failure instanceof ApiError && failure.status === 401) signOut()
    else throw failure
  }
  /** Runs a credential change: reauthentication prompt on demand, session loss signs out. */
  const protectedRun = async (action: () => Promise<void>) => {
    setError(null)
    setNotice(null)
    await reauth.run(action).catch(signOutOnUnauthorized)
  }
  const show = (action: () => Promise<void>) => protectedRun(action).catch(setError)
  const addPasskey = () => {
    const label = name.trim()
    setNameMissing(!label)
    if (!label) return
    void show(async () => {
      const challenge = await startAdminPasskeyRegistration()
      const credential = await passkey.register(challenge.optionsJSON)
      await registerAdminPasskey({ challengeId: challenge.challengeId, name: label, credential })
      setName('')
      setNotice('Passkey added.')
      await refresh()
    })
  }
  const security = query.data
  return (
    <AdministrationLayout title="Security">
      <AdministrationPageHeader
        title="Security"
        description="Passkeys, recovery codes and authenticator app of your administrator account."
      />
      {notice && (
        <p role="status" className="rounded-xl bg-[var(--accent-soft)] p-3 text-sm">
          {translate(notice)}
        </p>
      )}
      <FormError error={error} />
      {!security ? (
        <RequestState query={query} />
      ) : (
        <div className="space-y-content">
          <Card>
            <CardHeader>
              <CardTitle>{translate('Passkeys')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-content">
              <p className="text-sm text-[var(--muted)]">
                {translate(
                  'Sign in with your fingerprint, face or device code, without a password.',
                )}
              </p>
              <PasskeyList
                passkeys={security.passkeys}
                protectedRun={show}
                onRemoved={() => {
                  setNotice('Passkey removed.')
                  void refresh()
                }}
              />
              {!passkey.supported ? (
                <p role="status" className="text-sm text-[var(--muted)]">
                  {translate('Passkeys are not supported by this browser.')}
                </p>
              ) : security.passkeys.length >= maxPasskeys ? (
                <p className="text-sm text-[var(--muted)]">
                  {translate('You reached the maximum of 10 passkeys. Remove one to add another.')}
                </p>
              ) : (
                <form
                  noValidate
                  className="space-y-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    addPasskey()
                  }}
                >
                  <Label htmlFor="passkey-name">{translate('Passkey name')}</Label>
                  <div className="flex flex-wrap gap-3">
                    <Input
                      id="passkey-name"
                      className="min-w-0 flex-1"
                      maxLength={60}
                      value={name}
                      aria-invalid={nameMissing}
                      aria-describedby={nameMissing ? 'passkey-name-error' : undefined}
                      onChange={(event) => setName(event.target.value)}
                    />
                    <Button type="submit">{translate('Add a passkey')}</Button>
                  </div>
                  {nameMissing && (
                    <p
                      id="passkey-name-error"
                      role="alert"
                      className="text-sm text-[var(--error-text)]"
                    >
                      {translate('Give this passkey a name, for example “Work laptop”.')}
                    </p>
                  )}
                </form>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{translate('Recovery codes')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-content">
              <p className="text-sm text-[var(--muted)]">
                {translate(
                  'Single-use codes to sign in if you lose your authenticator app. Remaining: {{count}}.',
                  { count: security.recoveryCodesRemaining },
                )}
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  void show(async () => {
                    setCodes((await regenerateAdminRecoveryCodes()).codes)
                    await refresh()
                  })
                }
              >
                {translate(
                  security.recoveryCodesRemaining
                    ? 'Generate new codes'
                    : 'Generate recovery codes',
                )}
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{translate('Authenticator app')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-content">
              <TotpReplacementPanel
                enrollment={enrollment}
                protectedRun={protectedRun}
                onError={setError}
                onStart={setEnrollment}
                onCancel={() => setEnrollment(null)}
                onConfirmed={() => {
                  setEnrollment(null)
                  setNotice('Authenticator app replaced. Other sessions were closed.')
                  void refresh()
                }}
              />
            </CardContent>
          </Card>
        </div>
      )}
      {codes && <RecoveryCodesDialog codes={codes} onClose={() => setCodes(null)} />}
      {reauth.prompting && (
        <ReauthenticationDialog
          passkeyAvailable={(security?.passkeys.length ?? 0) > 0}
          onCancel={reauth.cancel}
          onSessionLost={signOut}
          onDone={async () => {
            // The single retry runs outside protectedRun, so it applies the same session-loss rule.
            await reauth.resume().catch(signOutOnUnauthorized).catch(setError)
          }}
        />
      )}
    </AdministrationLayout>
  )
}
