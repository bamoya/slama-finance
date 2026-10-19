import { Ban } from 'lucide-react'
import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
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
  loadingImpact: 'Loading impact…',
  reloadImpact: 'Review impact again',
})

export function CancellationDialog({
  triggerLabel,
  title,
  description,
  onConfirm,
  validateReason,
  maxLength = 1000,
  disabled = false,
  preview,
  initiallyOpen = false,
  onDismiss,
}: {
  triggerLabel: string
  title: string
  description?: string
  onConfirm: (reason: string, token?: string) => Promise<void>
  validateReason: (reason: string) => boolean
  maxLength?: number
  disabled?: boolean
  preview?: () => Promise<{ token: string; content: ReactNode }>
  initiallyOpen?: boolean
  onDismiss?: () => void
}) {
  useUiLanguage()

  const { t } = useTranslation('cancellation')
  const id = useId()
  const menu = useMoreActionsContext()
  const submitting = useRef(false)
  const [open, setOpen] = useState(initiallyOpen)
  const [reason, setReason] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [impact, setImpact] = useState<{ token: string; content: ReactNode } | null>(null)
  const [loading, setLoading] = useState(false)
  const [reload, setReload] = useState(0)
  const previewRef = useRef(preview)
  previewRef.current = preview
  useEffect(() => {
    if (!open || !previewRef.current) return
    let active = true
    setImpact(null)
    setError(null)
    setLoading(true)
    void previewRef.current().then(
      (result) => {
        if (active) {
          setImpact(result)
          setLoading(false)
        }
      },
      (failure: unknown) => {
        if (active) {
          setError(failure)
          setLoading(false)
        }
      },
    )
    return () => {
      active = false
    }
  }, [open, reload])
  function close() {
    setOpen(false)
    setImpact(null)
    onDismiss?.()
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submitting.current) return
        setOpen(next)
        setImpact(null)
        if (!next) onDismiss?.()
        setReason('')
        setInvalid(false)
        setError(null)
      }}
    >
      {initiallyOpen ? null : menu ? (
        <MoreAction
          label={triggerLabel}
          icon={<Ban />}
          destructive
          disabled={disabled}
          onSelect={() => {
            setImpact(null)
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
        className={`max-h-[calc(100dvh-2rem)] overflow-y-auto ${document.documentElement.classList.contains('theme-dark') ? 'is-dark' : ''}`}
      >
        <form
          className="flex flex-col gap-content"
          onSubmit={async (event) => {
            event.preventDefault()
            if (submitting.current) return
            if (preview && (!impact || loading)) return
            const trimmed = reason.trim()
            if (!validateReason(trimmed)) {
              setInvalid(true)
              return
            }
            submitting.current = true
            setPending(true)
            setError(null)
            try {
              if (preview) await onConfirm(trimmed, impact!.token)
              else await onConfirm(trimmed)
              close()
              setReason('')
            } catch (failure) {
              setError(failure)
              if (preview) setImpact(null)
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
          {preview && (
            <div aria-live="polite">
              {loading ? (
                <p className="text-sm text-muted-foreground">{t('loadingImpact')}</p>
              ) : (
                impact?.content
              )}
              {!loading && !impact && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setReload((value) => value + 1)}
                >
                  {t('reloadImpact')}
                </Button>
              )}
            </div>
          )}
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
            <Button type="button" variant="outline" disabled={pending} onClick={close}>
              {t('back')}
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={
                pending ||
                disabled ||
                (!!preview && (!impact || loading || !validateReason(reason.trim())))
              }
            >
              {pending ? t('saving') : t('confirm')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
