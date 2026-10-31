import { X } from 'lucide-react'
import { type KeyboardEvent } from 'react'

import { Input } from '../../../../../components/ui/input'
import { translate } from '../../../../../lib/i18n'
import { parseMethods } from '../billing-settings'

/**
 * Removable chips for the payment method codes. The value stays a comma-separated string so the
 * shared validation applies; text typed but not yet confirmed is kept in `draft`.
 */
export function PaymentMethodsInput({
  id,
  value,
  draft,
  invalid,
  describedBy,
  onChange,
  onDraftChange,
}: {
  id: string
  value: string
  draft: string
  invalid: boolean
  describedBy?: string
  onChange: (value: string) => void
  onDraftChange: (draft: string) => void
}) {
  const methods = parseMethods(value)
  const commit = () => {
    const added = parseMethods(draft)
    if (!added.length) return
    onChange([...methods, ...added].join(', '))
    onDraftChange('')
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      commit()
    } else if (event.key === 'Backspace' && !draft && methods.length) {
      onChange(methods.slice(0, -1).join(', '))
    }
  }
  return (
    <div className="space-y-2">
      {methods.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={translate('Selected payment methods')}>
          {methods.map((method) => (
            <li
              key={method}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] py-1 pl-3 pr-1 text-sm font-semibold text-[var(--accent)]"
            >
              {method}
              <button
                type="button"
                aria-label={`${translate('Remove')} ${method}`}
                className="grid size-5 place-items-center rounded-full hover:bg-[var(--surface)]"
                onClick={() => onChange(methods.filter((item) => item !== method).join(', '))}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Input
        id={id}
        value={draft}
        placeholder={translate('Type a method and press Enter')}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
      />
    </div>
  )
}
