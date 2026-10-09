import { Ban } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { registerTranslations, useUiLanguage } from '../../lib/i18n'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '../ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel } from '../ui/field'
import { Textarea } from '../ui/textarea'
import { FormError } from './form-error'
import { MoreAction } from './more-actions'
import { useMoreActionsContext } from './more-actions-context'

registerTranslations('cancellation', {
  reason: 'Cancellation reason',
  description: 'Enter a reason before confirming this cancellation.',
  invalid: 'Enter a valid cancellation reason.',
  back: 'Go back',
  confirm: 'Confirm cancellation',
  saving: 'Cancelling…',
})

export function CancellationDialog({
  triggerLabel,
  title,
  description,
  onConfirm,
  validateReason,
  maxLength = 1000,
  disabled = false,
}: {
  triggerLabel: string
  title: string
  description?: string
  onConfirm: (reason: string) => Promise<void>
  validateReason: (reason: string) => boolean
  maxLength?: number
  disabled?: boolean
}) {
  useUiLanguage()

  const { t } = useTranslation('cancellation')
  const id = useId()
  const menu = useMoreActionsContext()
  const submitting = useRef(false)
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submitting.current) return
        setOpen(next)
        setReason('')
        setInvalid(false)
        setError(null)
      }}
    >
      {menu ? (
        <MoreAction
          label={triggerLabel}
          icon={<Ban />}
          destructive
          disabled={disabled}
          onSelect={() => {
            setReason('')
            setInvalid(false)
            setError(null)
            setOpen(true)
          }}
        />
      ) : (
        <DialogTrigger asChild>
          <Button type="button" variant="destructive" disabled={disabled}>
            <Ban data-icon="inline-start" />
            {triggerLabel}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent
        onCloseAutoFocus={
          menu
            ? (event) => {
                event.preventDefault()
                menu.restoreFocus()
              }
            : undefined
        }
        className={
          document.documentElement.classList.contains('theme-dark') ? 'is-dark' : undefined
        }
      >
        <form
          className="flex flex-col gap-content"
          onSubmit={async (event) => {
            event.preventDefault()
            if (submitting.current) return
            const trimmed = reason.trim()
            if (!validateReason(trimmed)) {
              setInvalid(true)
              return
            }
            submitting.current = true
            setPending(true)
            setError(null)
            try {
              await onConfirm(trimmed)
              setOpen(false)
              setReason('')
            } catch (failure) {
              setError(failure)
            } finally {
              submitting.current = false
              setPending(false)
            }
          }}
        >
          <div className="flex flex-col gap-2">
            <DialogTitle className="text-xl font-bold">{title}</DialogTitle>
            <DialogDescription className="text-sm leading-6 text-[var(--muted)]">
              {description ?? t('description')}
            </DialogDescription>
          </div>
          <FieldGroup>
            <Field data-invalid={invalid} data-disabled={pending}>
              <FieldLabel htmlFor={id}>{t('reason')}</FieldLabel>
              <Textarea
                id={id}
                value={reason}
                maxLength={maxLength}
                disabled={pending}
                aria-invalid={invalid}
                aria-describedby={invalid ? `${id}-error` : undefined}
                onChange={(event) => {
                  setReason(event.target.value)
                  setInvalid(false)
                }}
              />
              {invalid && <FieldError id={`${id}-error`}>{t('invalid')}</FieldError>}
            </Field>
          </FieldGroup>
          <FormError error={error} />
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              {t('back')}
            </Button>
            <Button type="submit" variant="destructive" disabled={pending || disabled}>
              {pending ? t('saving') : t('confirm')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
