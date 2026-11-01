import { forwardRef, type InputHTMLAttributes, useState } from 'react'

import { Input } from './input'

/** Remove leading zeros typed in front of a digit ("040" becomes "40"), keeping "0.5" and the sign. */
export function normalizeNumberDraft(raw: string) {
  return raw.replace(/^(-?)0+(?=\d)/, '$1')
}

type NumberInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type'
> & {
  value: number | string
  onValueChange: (value: string) => void
}

/**
 * Numeric field that keeps the typed text but never displays leading zeros, so typing over a
 * default of 0 replaces it. The parent receives the normalized string and decides how to parse it.
 */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  ({ value, onValueChange, ...props }, ref) => {
    const [draft, setDraft] = useState(String(value))
    const external = String(value)
    const shown =
      draft === ''
        ? Number(external) === 0
          ? ''
          : external
        : Number(draft) === Number(external)
          ? draft
          : external
    return (
      <Input
        ref={ref}
        {...props}
        type="number"
        inputMode={props.inputMode ?? 'decimal'}
        value={shown}
        onChange={(event) => {
          const next = normalizeNumberDraft(event.target.value)
          setDraft(next)
          onValueChange(next)
        }}
      />
    )
  },
)
NumberInput.displayName = 'NumberInput'
