import { useState } from 'react'

import {
  reauthenticateAdmin,
  startAdminReauthentication,
} from '../../../../../api/generated/administration/administration'
import { FormError } from '../../../../../components/management/form-error'
import { Button } from '../../../../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../../../../../components/ui/dialog'
import { Input } from '../../../../../components/ui/input'
import { Label } from '../../../../../components/ui/label'
import { ApiError } from '../../../../../lib/api-error'
import { translate, useUiLanguage } from '../../../../../lib/i18n'
import { usePasskeyCeremony } from '../../auth/hooks/use-passkey-ceremony'

/** Confirms the administrator again with a passkey (only when one exists) or password and code. */
export function ReauthenticationDialog({
  passkeyAvailable,
  onDone,
  onCancel,
  onSessionLost,
}: {
  passkeyAvailable: boolean
  onDone: () => Promise<void>
  onCancel: () => void
  onSessionLost: () => void
}) {
  useUiLanguage()
  const passkey = usePasskeyCeremony()
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [attempted, setAttempted] = useState(false)
  const finish = async (attempt: () => Promise<unknown>) => {
    setPending(true)
    setError(null)
    try {
      await attempt()
      setPassword('')
      setCode('')
      await onDone()
    } catch (failure) {
      setPassword('')
      setCode('')
      if (
        failure instanceof ApiError &&
        failure.status === 401 &&
        failure.code !== 'REAUTHENTICATION_FAILED'
      ) {
        onSessionLost()
        return
      }
      setError(failure)
    } finally {
      setPending(false)
    }
  }
  const withPasskey = () =>
    finish(async () => {
      const challenge = await startAdminReauthentication()
      const credential = await passkey.authenticate(challenge.optionsJSON)
      await reauthenticateAdmin({
        method: 'passkey',
        challengeId: challenge.challengeId,
        credential,
      })
    })
  const withPassword = () => {
    setAttempted(true)
    if (!password || !/^\d{6}$/.test(code)) return
    void finish(() => reauthenticateAdmin({ method: 'password_totp', password, code }))
  }
  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onCancel()}>
      <DialogContent
        className={document.documentElement.classList.contains('theme-dark') ? 'is-dark' : ''}
      >
        <form
          className="flex flex-col gap-content"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            withPassword()
          }}
        >
          <DialogTitle>{translate('Confirm it is you')}</DialogTitle>
          <DialogDescription>
            {translate('This change protects your account. Confirm your identity to continue.')}
          </DialogDescription>
          {passkeyAvailable && passkey.supported && (
            <>
              <Button type="button" disabled={pending} onClick={() => void withPasskey()}>
                {translate('Confirm with a passkey')}
              </Button>
              <p className="text-center text-xs text-[var(--muted)]">
                {translate('Or use your password and authenticator code')}
              </p>
            </>
          )}
          <div className="space-y-2">
            <Label htmlFor="reauth-password">{translate('Password')}</Label>
            <Input
              id="reauth-password"
              type="password"
              autoComplete="current-password"
              value={password}
              disabled={pending}
              aria-invalid={attempted && !password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reauth-code">{translate('Authenticator code')}</Label>
            <Input
              id="reauth-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              disabled={pending}
              aria-invalid={attempted && !/^\d{6}$/.test(code)}
              aria-describedby={
                attempted && !/^\d{6}$/.test(code) ? 'reauth-code-error' : undefined
              }
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            />
            {attempted && (!password || !/^\d{6}$/.test(code)) && (
              <p id="reauth-code-error" role="alert" className="text-sm text-[var(--error-text)]">
                {translate('Enter your password and the 6-digit code from your authenticator app.')}
              </p>
            )}
          </div>
          <FormError error={error} />
          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
              {translate('Cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? translate('Please wait…') : translate('Confirm')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
