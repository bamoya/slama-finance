import { REGEXP_ONLY_DIGITS } from 'input-otp'

import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '../../../../../components/ui/input-otp'
import { Label } from '../../../../../components/ui/label'
import { translate } from '../../../../../lib/i18n'

/** Fresh authenticator code required before a sensitive administrator action. */
export function TwoFactorCodeField({
  value,
  onChange,
  invalid,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  invalid: boolean
  disabled: boolean
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="action-code">{translate('Authenticator code')}</Label>
      <InputOTP
        id="action-code"
        maxLength={6}
        pattern={REGEXP_ONLY_DIGITS}
        inputMode="numeric"
        autoComplete="one-time-code"
        value={value}
        disabled={disabled}
        aria-label={translate('Authenticator code')}
        aria-invalid={invalid}
        aria-describedby={invalid ? 'action-code-error' : 'action-code-hint'}
        onChange={onChange}
        containerClassName="justify-start gap-3"
      >
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
          <InputOTPSlot index={2} />
        </InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup>
          <InputOTPSlot index={3} />
          <InputOTPSlot index={4} />
          <InputOTPSlot index={5} />
        </InputOTPGroup>
      </InputOTP>
      {invalid ? (
        <p id="action-code-error" role="alert" className="text-sm text-[var(--error-text)]">
          {translate('Enter the 6-digit code from your authenticator app.')}
        </p>
      ) : (
        <p id="action-code-hint" className="text-xs text-[var(--muted)]">
          {translate('This sensitive action requires a fresh code from your authenticator app.')}
        </p>
      )}
    </div>
  )
}
