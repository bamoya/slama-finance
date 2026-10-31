import { REGEXP_ONLY_DIGITS } from 'input-otp'
import { useRef, useState } from 'react'

import { FormError } from '../../../../../components/management/form-error'
import { Button } from '../../../../../components/ui/button'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '../../../../../components/ui/input-otp'
import { Label } from '../../../../../components/ui/label'
import { translate, useUiLanguage } from '../../../../../lib/i18n'

const codeLength = 6

/** Six-digit authenticator code: submits itself once the sixth digit is entered. */
export function CodeForm({ onSubmit }: { onSubmit: (code: string) => Promise<void> }) {
  useUiLanguage()
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [invalid, setInvalid] = useState(false)
  const submitting = useRef(false)
  const submit = async (value: string) => {
    if (submitting.current) return
    if (!new RegExp(`^[0-9]{${codeLength}}$`).test(value)) {
      setInvalid(true)
      setError(null)
      return
    }
    submitting.current = true
    setInvalid(false)
    setError(null)
    setPending(true)
    try {
      await onSubmit(value)
    } catch (reason) {
      setError(reason)
      setCode('')
    } finally {
      submitting.current = false
      setPending(false)
    }
  }
  return (
    <form
      noValidate
      className="space-y-content"
      onSubmit={(event) => {
        event.preventDefault()
        void submit(code)
      }}
    >
      <div className="space-y-3">
        <Label htmlFor="verification-code">{translate('Verification code')}</Label>
        <InputOTP
          id="verification-code"
          maxLength={codeLength}
          pattern={REGEXP_ONLY_DIGITS}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          value={code}
          disabled={pending}
          aria-label={translate('Verification code')}
          aria-invalid={invalid}
          aria-describedby={invalid ? 'verification-code-error' : undefined}
          onChange={setCode}
          onComplete={(value) => void submit(value)}
          containerClassName="w-full justify-center gap-3"
        >
          <InputOTPGroup className="flex-1">
            <InputOTPSlot index={0} className="h-12 flex-1 text-lg" />
            <InputOTPSlot index={1} className="h-12 flex-1 text-lg" />
            <InputOTPSlot index={2} className="h-12 flex-1 text-lg" />
          </InputOTPGroup>
          <InputOTPSeparator />
          <InputOTPGroup className="flex-1">
            <InputOTPSlot index={3} className="h-12 flex-1 text-lg" />
            <InputOTPSlot index={4} className="h-12 flex-1 text-lg" />
            <InputOTPSlot index={5} className="h-12 flex-1 text-lg" />
          </InputOTPGroup>
        </InputOTP>
        {invalid && (
          <p id="verification-code-error" role="alert" className="text-sm text-[var(--error-text)]">
            {translate('Enter the 6-digit code from your authenticator app.')}
          </p>
        )}
      </div>
      <FormError error={error} />
      <Button type="submit" className="w-full" disabled={pending}>
        {translate('Verify')}
      </Button>
    </form>
  )
}
