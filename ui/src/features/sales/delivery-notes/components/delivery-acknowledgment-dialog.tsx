import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DeliveryNoteAcknowledgmentSchema } from '../../../../api/generated/schemas/sales/delivery-notes.schemas'
import { FormError } from '../../../../components/management/form-error'
import { Button } from '../../../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '../../../../components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel } from '../../../../components/ui/field'
import { Input } from '../../../../components/ui/input'
import { useUiLanguage } from '../../../../lib/i18n'

export function DeliveryAcknowledgmentDialog({
  expectedVersion,
  onConfirm,
  disabled = false,
}: {
  expectedVersion: number
  onConfirm: (receiver: string) => Promise<void>
  disabled?: boolean
}) {
  useUiLanguage()

  const { t } = useTranslation('sales')
  const id = useId()
  const [open, setOpen] = useState(false)
  const [receiver, setReceiver] = useState('')
  const [pending, setPending] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const [error, setError] = useState<unknown>()
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button
          type="button"

          disabled={disabled}
          onClick={() => {
            setReceiver('')
            setInvalid(false)
            setError(undefined)
          }}
        >
          {t('acknowledgeDelivery')}
        </Button>
      </DialogTrigger>
      <DialogContent
        className={document.documentElement.classList.contains('theme-dark') ? 'is-dark' : ''}
      >
        <form
          className="grid gap-content"
          onSubmit={async (event) => {
            event.preventDefault()
            if (pending) return
            const trimmed = receiver.trim()
            if (
              !DeliveryNoteAcknowledgmentSchema.safeParse({
                expectedVersion,
                receivedByName: trimmed,
              }).success
            ) {
              setInvalid(true)
              return
            }
            setPending(true)
            setError(undefined)
            try {
              await onConfirm(trimmed)
              setOpen(false)
            } catch (cause) {
              setError(cause)
            } finally {
              setPending(false)
            }
          }}
        >
          <div className="grid gap-2">
            <DialogTitle className="text-xl font-bold">{t('acknowledgeDelivery')}</DialogTitle>
            <DialogDescription>{t('acknowledgeDeliveryWarning')}</DialogDescription>
          </div>
          <FieldGroup>
            <Field data-invalid={invalid} data-disabled={pending}>
              <FieldLabel htmlFor={id}>{t('receiverName')}</FieldLabel>
              <Input
                id={id}
                value={receiver}
                maxLength={200}
                disabled={pending}
                aria-invalid={invalid}
                aria-describedby={invalid ? `${id}-error` : undefined}
                onChange={(event) => {
                  setReceiver(event.target.value)
                  setInvalid(false)
                }}
              />
              {invalid && <FieldError id={`${id}-error`}>{t('requiredField')}</FieldError>}
            </Field>
          </FieldGroup>
          <FormError error={error} />
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"

              disabled={pending}
              onClick={() => setOpen(false)}
            >
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {t('acknowledgeDelivery')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
