import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PaymentConfirmationSchema } from '../../../../api/generated/schemas/sales/payments.schemas'
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

const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca' }).format(new Date())

export function PaymentConfirmationDialog({
  expectedVersion,
  onConfirm,
  disabled = false,
}: {
  expectedVersion: number
  onConfirm: (collectedOn: string) => Promise<void>
  disabled?: boolean
}) {
  useUiLanguage()

  const { t } = useTranslation('sales')
  const id = useId()
  const [open, setOpen] = useState(false)
  const [collectedOn, setCollectedOn] = useState(today)
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
            setCollectedOn(today())
            setInvalid(false)
            setError(undefined)
          }}
        >
          {t('confirmPayment')}
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
            if (
              !PaymentConfirmationSchema.safeParse({ expectedVersion, collectedOn }).success ||
              collectedOn > today()
            ) {
              setInvalid(true)
              return
            }
            setPending(true)
            setError(undefined)
            try {
              await onConfirm(collectedOn)
              setOpen(false)
            } catch (cause) {
              setError(cause)
            } finally {
              setPending(false)
            }
          }}
        >
          <div className="grid gap-2">
            <DialogTitle className="text-xl font-bold">{t('confirmPayment')}</DialogTitle>
            <DialogDescription>{t('confirmPaymentWarning')}</DialogDescription>
          </div>
          <FieldGroup>
            <Field data-invalid={invalid} data-disabled={pending}>
              <FieldLabel htmlFor={id}>{t('collectedOn')}</FieldLabel>
              <Input
                id={id}
                type="date"
                max={today()}
                value={collectedOn}
                disabled={pending}
                aria-invalid={invalid}
                aria-describedby={invalid ? `${id}-error` : undefined}
                onChange={(event) => {
                  setCollectedOn(event.target.value)
                  setInvalid(false)
                }}
              />
              {invalid && <FieldError id={`${id}-error`}>{t('invalidDate')}</FieldError>}
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
              {t('confirmPayment')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
