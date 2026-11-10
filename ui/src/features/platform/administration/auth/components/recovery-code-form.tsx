import { useState } from 'react'

import { FormError } from '../../../../../components/management/form-error'
import { Button } from '../../../../../components/ui/button'
import { Input } from '../../../../../components/ui/input'
import { Label } from '../../../../../components/ui/label'
import { translate, useUiLanguage } from '../../../../../lib/i18n'

/** Single-use recovery code entry for an administrator who lost the authenticator. */
export function RecoveryCodeForm({
  onSubmit,
  onBack,
}: {
  onSubmit: (code: string) => Promise<void>
  onBack: () => void
}) {
  useUiLanguage()
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [invalid, setInvalid] = useState(false)
  const submit = async () => {
    const value = code.trim()
    setInvalid(!value)
    if (!value) return
    setPending(true)
    setError(null)
    try {
      await onSubmit(value)
    } catch (failure) {
      setError(failure)
      setCode('')
    } finally {
      setPending(false)
    }
  }
  return (
    <form
      noValidate
      className="space-y-content"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="recovery-code">{translate('Recovery code')}</Label>
        <Input
          id="recovery-code"
          autoFocus
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="XXXX-XXXX-XXXX-XXXX"
          value={code}
          disabled={pending}
          aria-invalid={invalid}
          aria-describedby={invalid ? 'recovery-code-error' : undefined}
          onChange={(event) => setCode(event.target.value)}
        />
        {invalid && (
          <p id="recovery-code-error" role="alert" className="text-sm text-[var(--error-text)]">
            {translate('Enter one of your recovery codes.')}
          </p>
        )}
      </div>
      <FormError error={error} />
      <Button type="submit" className="w-full" disabled={pending}>
        {translate('Sign in with this code')}
      </Button>
      <Button type="button" variant="ghost" className="w-full" disabled={pending} onClick={onBack}>
        {translate('Use the authenticator app instead')}
      </Button>
    </form>
  )
}
