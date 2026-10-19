import { Trash2 } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'

import { translate, useUiLanguage } from '../../lib/i18n'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { Tooltip } from '../ui/tooltip'
import { FormError } from './form-error'
import { MoreAction } from './more-actions'
import { useMoreActionsContext } from './more-actions-context'

/** Shared single/bulk destructive-action shell. Business impact belongs to features. */
export function ImpactConfirmationDialog({
  label,
  description,
  previewKey,
  loadPreview,
  onConfirm,
  options,
  initiallyOpen = false,
  onDismiss,
  disabled = false,
  iconOnly = false,
}: {
  label: string
  description: string
  previewKey: string
  loadPreview: () => Promise<{ token: string; content: ReactNode; blocked: boolean }>
  onConfirm: (token: string) => Promise<void>
  options?: ReactNode
  initiallyOpen?: boolean
  onDismiss?: () => void
  disabled?: boolean
  iconOnly?: boolean
}) {
  useUiLanguage()
  const menu = useMoreActionsContext()
  const [open, setOpen] = useState(initiallyOpen)
  const [review, setReview] = useState(0)
  const [impact, setImpact] = useState<{
    key: string
    token: string
    content: ReactNode
    blocked: boolean
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const submitting = useRef(false)
  const loader = useRef(loadPreview)
  loader.current = loadPreview
  const current = impact?.key === previewKey ? impact : null
  useEffect(() => {
    if (!open) return
    let active = true
    setImpact(null)
    setError(null)
    setLoading(true)
    void loader.current().then(
      (result) => {
        if (active) {
          setImpact({ ...result, key: previewKey })
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
  }, [open, previewKey, review])
  const close = () => {
    if (!submitting.current) {
      setOpen(false)
      setImpact(null)
      onDismiss?.()
    }
  }
  const begin = () => {
    setImpact(null)
    setError(null)
    setOpen(true)
  }
  return (
    <>
      {!initiallyOpen &&
        (menu ? (
          <MoreAction
            label={label}
            icon={<Trash2 />}
            destructive
            order={100}
            disabled={disabled}
            onSelect={begin}
          />
        ) : (
          <Tooltip label={label}>
            <Button
              variant="destructive"
              type="button"
              size={iconOnly ? 'icon' : 'default'}
              aria-label={label}
              disabled={disabled}
              onClick={begin}
            >
              <Trash2 data-icon="inline-start" />
              {!iconOnly && label}
            </Button>
          </Tooltip>
        ))}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) close()
        }}
      >
        <DialogContent
          className={`max-h-[calc(100dvh-2rem)] overflow-y-auto ${document.documentElement.classList.contains('theme-dark') ? 'is-dark' : ''}`}
          onCloseAutoFocus={
            menu
              ? (event) => {
                  event.preventDefault()
                  menu.restoreFocus()
                }
              : undefined
          }
        >
          <div className="flex flex-col gap-content">
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
            {options && <fieldset disabled={pending}>{options}</fieldset>}
            <div aria-live="polite">
              {loading || (!current && !error) ? (
                <p className="text-sm text-muted-foreground">{translate('Loading impact…')}</p>
              ) : (
                current?.content
              )}
            </div>
            <FormError error={error} />
            {!loading && (!current || current.blocked) && (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setReview((value) => value + 1)}
              >
                {translate('Review impact again')}
              </Button>
            )}
            <div className="flex flex-wrap justify-end gap-3">
              <Button type="button" variant="outline" disabled={pending} onClick={close}>
                {translate('Cancel')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={pending || disabled || loading || !current || current.blocked}
                onClick={async () => {
                  if (submitting.current || !current || current.blocked) return
                  submitting.current = true
                  setPending(true)
                  setError(null)
                  try {
                    await onConfirm(current.token)
                    submitting.current = false
                    close()
                  } catch (failure) {
                    setImpact(null)
                    setError(failure)
                  } finally {
                    submitting.current = false
                    setPending(false)
                  }
                }}
              >
                {pending ? translate('Deleting…') : translate('Delete permanently')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
