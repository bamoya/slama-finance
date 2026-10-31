import { useState } from 'react'

import type { AdminPayment } from '../../../../../api/generated/models'
import { FormError } from '../../../../../components/management/form-error'
import { Button } from '../../../../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../../../../../components/ui/dialog'
import { Input } from '../../../../../components/ui/input'
import { Label } from '../../../../../components/ui/label'
import { Textarea } from '../../../../../components/ui/textarea'
import { translate, useUiLanguage } from '../../../../../lib/i18n'
import { formatDh } from '../../../subscriptions/components/billing-format'

export type Decision = 'confirm' | 'reject'

/** Confirmation shell shared by both decisions: states the impact, then asks for input. */
export function PaymentDecisionDialog({
  payment,
  decision,
  onClose,
  onConfirm,
  onReject,
}: {
  payment: AdminPayment
  decision: Decision
  onClose: () => void
  onConfirm: (receivedReference: string | undefined) => Promise<unknown>
  onReject: (reason: string) => Promise<unknown>
}) {
  useUiLanguage()
  const [value, setValue] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [missing, setMissing] = useState(false)
  const reject = decision === 'reject'
  const submit = async () => {
    const text = value.trim()
    if (reject && !text) {
      setMissing(true)
      return
    }
    setMissing(false)
    setPending(true)
    setError(null)
    try {
      if (reject) await onReject(text)
      else await onConfirm(text || undefined)
      onClose()
    } catch (failure) {
      setError(failure)
    } finally {
      setPending(false)
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent
        className={document.documentElement.classList.contains('theme-dark') ? 'is-dark' : ''}
      >
        <form
          className="flex flex-col gap-content"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <DialogTitle>{translate(reject ? 'Reject payment' : 'Confirm payment')}</DialogTitle>
          <DialogDescription>
            {translate(
              reject
                ? 'The owner is told why the payment was rejected. This cannot be undone.'
                : 'Confirming activates or extends the owner subscription. This cannot be undone.',
            )}
          </DialogDescription>
          <dl className="grid grid-cols-2 gap-2 rounded-xl bg-[var(--accent-soft)] p-3 text-sm">
            <dt className="text-[var(--muted)]">{translate('Customer')}</dt>
            <dd className="break-all font-semibold">{payment.ownerEmail}</dd>
            <dt className="text-[var(--muted)]">{translate('Reference')}</dt>
            <dd className="break-all font-semibold">{payment.reference}</dd>
            <dt className="text-[var(--muted)]">{translate('Total incl. tax')}</dt>
            <dd className="font-semibold">{formatDh(payment.amount.amountTtc)}</dd>
          </dl>
          {reject ? (
            <div className="space-y-2">
              <Label htmlFor="rejection-reason">{translate('Rejection reason')}</Label>
              <Textarea
                id="rejection-reason"
                value={value}
                maxLength={500}
                aria-invalid={missing}
                aria-describedby={missing ? 'rejection-reason-error' : undefined}
                onChange={(event) => setValue(event.target.value)}
              />
              {missing && (
                <p
                  id="rejection-reason-error"
                  role="alert"
                  className="text-sm text-[var(--error-text)]"
                >
                  {translate('Indicate why the payment is rejected.')}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="received-reference">
                {translate('Received reference (optional)')}
              </Label>
              <Input
                id="received-reference"
                value={value}
                maxLength={120}
                onChange={(event) => setValue(event.target.value)}
              />
            </div>
          )}
          <FormError error={error} />
          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
              {translate('Cancel')}
            </Button>
            <Button type="submit" variant={reject ? 'destructive' : 'default'} disabled={pending}>
              {pending
                ? translate('Please wait…')
                : translate(reject ? 'Reject payment' : 'Confirm payment')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
