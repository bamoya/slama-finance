import { type ComponentProps, type ReactNode, useState } from 'react'

import { translate, useUiLanguage } from '../../lib/i18n'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { Tooltip } from '../ui/tooltip'
import { FormError } from './form-error'
import { MoreAction } from './more-actions'
import { useMoreActionsContext } from './more-actions-context'
export function ConfirmAction({
  label,
  description,
  onConfirm,
  disabled = false,
  variant = 'default',
  size,
  icon,
  iconOnly = false,
}: {
  label: string
  description: string
  onConfirm: () => Promise<void>
  disabled?: boolean
  variant?: ComponentProps<typeof Button>['variant']
  size?: ComponentProps<typeof Button>['size']
  icon?: ReactNode
  iconOnly?: boolean
}) {
  useUiLanguage()

  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const menu = useMoreActionsContext()
  const begin = () => {
    setError(null)
    setOpen(true)
  }
  return (
    <>
      {menu ? (
        <MoreAction
          label={label}
          icon={icon}
          destructive={variant === 'destructive'}
          disabled={disabled}
          onSelect={begin}
        />
      ) : (
        <Tooltip label={label}>
          <Button
            type="button"
            variant={variant}
            size={size ?? (iconOnly && icon ? 'icon' : 'default')}
            aria-label={label}
            disabled={disabled}
            onClick={begin}
          >
            {icon && <span aria-hidden="true">{icon}</span>}
            {(!iconOnly || !icon) && label}
          </Button>
        </Tooltip>
      )}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!pending) setOpen(value)
        }}
      >
        <DialogContent
          onCloseAutoFocus={
            menu
              ? (event) => {
                  event.preventDefault()
                  menu.restoreFocus()
                }
              : undefined
          }
          className={localStorage.getItem('slama-theme') === 'dark' ? 'is-dark' : ''}
        >
          <DialogTitle className="text-xl font-bold">{label}</DialogTitle>
          <DialogDescription className="mt-3 text-sm leading-6 text-[var(--muted)]">
            {description}
          </DialogDescription>
          <div className="mt-4">
            <FormError error={error} />
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              {translate('Cancel')}
            </Button>
            <Button
              variant={variant === 'destructive' ? 'destructive' : 'default'}
              disabled={pending}
              onClick={async () => {
                setPending(true)
                setError(null)
                try {
                  await onConfirm()
                  setOpen(false)
                } catch (reason) {
                  setError(reason)
                } finally {
                  setPending(false)
                }
              }}
            >
              {pending ? translate('Saving…') : translate('Confirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
