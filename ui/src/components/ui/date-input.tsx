import { Popover } from '@base-ui/react/popover'
import { CalendarDays } from 'lucide-react'
import {
  type ChangeEvent,
  forwardRef,
  type InputHTMLAttributes,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'

import { displayDate } from '../../lib/dates'
import { translate, useUiLanguage } from '../../lib/i18n'
import { cn } from '../../lib/utils'
import { Button } from './button'
import { Calendar } from './calendar'
import { formControlStyles } from './form-control-styles'

export function dateInputValue(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) value = displayDate(value)
  if (/^\d{8}$/.test(value)) value = `${value.slice(0, 2)}-${value.slice(2, 4)}-${value.slice(4)}`
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value)
  if (!match) return value
  const iso = `${match[3]}-${match[2]}-${match[1]}`
  const date = new Date(`${iso}T12:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : value
}

function formatDateTyping(value: string, deleting: boolean) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return displayDate(value)
  if (!/^[\d\s/-]*$/.test(value)) return value
  const digits = value.replace(/\D/g, '').slice(0, 8)
  let result = digits.slice(0, 2)
  if (digits.length > 2 || (digits.length === 2 && !deleting)) result += '-'
  result += digits.slice(2, 4)
  if (digits.length > 4 || (digits.length === 4 && !deleting)) result += '-'
  return result + digits.slice(4)
}

/** Fixed display format with ISO values passed to existing form contracts. */
export const DateInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ value, defaultValue, onChange, className, disabled, min, max, ...props }, ref) => {
    const language = useUiLanguage()
    const [open, setOpen] = useState(false)
    const [uncontrolled, setUncontrolled] = useState(String(defaultValue ?? ''))
    const input = useRef<HTMLInputElement>(null)
    useImperativeHandle(ref, () => input.current!, [])
    const raw = value === undefined ? uncontrolled : String(value ?? '')
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : ''
    useEffect(() => {
      const valid = !raw || (!!iso && (!min || iso >= String(min)) && (!max || iso <= String(max)))
      input.current?.setCustomValidity(valid ? '' : translate('Enter a valid date as DD-MM-YYYY.'))
    }, [raw, iso, min, max, language])
    const emit = (next: string, event?: ChangeEvent<HTMLInputElement>) => {
      if (value === undefined) setUncontrolled(next)
      onChange?.({
        ...event,
        target: { ...event?.target, value: next },
        currentTarget: { ...event?.currentTarget, value: next },
      } as ChangeEvent<HTMLInputElement>)
    }
    return (
      <Popover.Root open={open} onOpenChange={setOpen}>
        <div className="relative w-full min-w-0">
          <input
            {...props}
            ref={input}
            type="text"
            inputMode="numeric"
            data-slot="input"
            data-date-input="true"
            className={cn(formControlStyles, 'flex h-control w-full px-3 py-2 pr-10', className)}
            value={raw ? displayDate(raw) : ''}
            placeholder={translate('DD-MM-YYYY')}
            pattern="[0-9]{2}-[0-9]{2}-[0-9]{4}"
            disabled={disabled}
            onChange={(event) => {
              const typed = event.target.value
              const deleting =
                (event.nativeEvent as InputEvent).inputType?.startsWith('delete') ??
                typed.length < (raw ? displayDate(raw).length : 0)
              const formatted = formatDateTyping(typed, deleting)
              const next = dateInputValue(formatted)
              const selection = event.target.selectionStart ?? typed.length
              const digitsBeforeCursor = typed.slice(0, selection).replace(/\D/g, '').length
              let cursor = 0,
                digits = 0
              if (/^\d{4}-\d{2}-\d{2}$/.test(typed)) cursor = formatted.length
              else {
                while (cursor < formatted.length && digits < digitsBeforeCursor) {
                  if (/\d/.test(formatted[cursor]!)) digits++
                  cursor++
                }
                if (
                  !deleting ||
                  (event.nativeEvent as InputEvent).inputType === 'deleteContentForward'
                )
                  while (formatted[cursor] === '-') cursor++
              }
              // Set the display before notifying the form so React need not rewrite
              // the DOM value and move the cursor to the end during mid-date edits.
              event.target.value = formatted
              event.target.setSelectionRange(cursor, cursor)
              const valid =
                !next ||
                (/^\d{4}-\d{2}-\d{2}$/.test(next) &&
                  (!min || next >= String(min)) &&
                  (!max || next <= String(max)))
              event.target.setCustomValidity(
                valid ? '' : translate('Enter a valid date as DD-MM-YYYY.'),
              )
              emit(next, event)
            }}
          />
          <Popover.Trigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 size-7 -translate-y-1/2"
                disabled={disabled}
                aria-label={translate('Open calendar')}
              />
            }
          >
            <CalendarDays className="size-4" />
          </Popover.Trigger>
        </div>
        <Popover.Portal>
          <Popover.Positioner sideOffset={8} className="z-[100]">
            <Popover.Popup className="rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-lg">
              <Calendar
                mode="single"
                selected={iso ? new Date(`${iso}T12:00:00`) : undefined}
                defaultMonth={iso ? new Date(`${iso}T12:00:00`) : undefined}
                disabled={(date) => {
                  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
                  return (!!min && key < String(min)) || (!!max && key > String(max))
                }}
                onSelect={(date) => {
                  if (date)
                    emit(
                      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
                    )
                  setOpen(false)
                }}
              />
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    )
  },
)
DateInput.displayName = 'DateInput'
