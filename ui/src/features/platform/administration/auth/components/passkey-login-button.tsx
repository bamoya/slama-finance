import { KeyRound } from 'lucide-react'
import { useState } from 'react'

import {
  startAdminPasskeyLogin,
  verifyAdminPasskeyLogin,
} from '../../../../../api/generated/administration/administration'
import type { AdminSession } from '../../../../../api/generated/models'
import { FormError } from '../../../../../components/management/form-error'
import { Button } from '../../../../../components/ui/button'
import { ApiError } from '../../../../../lib/api-error'
import { translate, useUiLanguage } from '../../../../../lib/i18n'
import { usePasskeyCeremony } from '../hooks/use-passkey-ceremony'

/** Passwordless sign-in: the device verifies the administrator, no authenticator code follows. */
export function PasskeyLoginButton({ onSession }: { onSession: (session: AdminSession) => void }) {
  useUiLanguage()
  const passkey = usePasskeyCeremony()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  if (!passkey.supported) return null
  const run = async () => {
    setPending(true)
    setError(null)
    try {
      const challenge = await startAdminPasskeyLogin()
      const credential = await passkey.authenticate(challenge.optionsJSON)
      onSession(await verifyAdminPasskeyLogin({ challengeId: challenge.challengeId, credential }))
    } catch (failure) {
      setError(
        failure instanceof ApiError && failure.status === 401
          ? new Error('This passkey was not accepted. Use another passkey or your password.')
          : failure,
      )
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="space-y-content">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={pending}
        onClick={() => void run()}
      >
        <KeyRound aria-hidden="true" />
        {pending ? translate('Please wait…') : translate('Sign in with a passkey')}
      </Button>
      <FormError error={error} />
    </div>
  )
}
