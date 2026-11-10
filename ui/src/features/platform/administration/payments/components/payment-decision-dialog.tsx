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
import { displayDateTime } from '../../../../../lib/dates'
import { translate, useUiLanguage } from '../../../../../lib/i18n'
import { formatDh, parseDh } from '../../../subscriptions/components/billing-format'

export type Decision = 'confirm' | 'reject'

/** Verified receipt; omitted fields default on the server (owner reference, balance, now). */
export type ReceivedFunds = {
  receivedReference?: string
  receivedAmountTtc?: number
  receivedAt?: string
}

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
  onConfirm: (receipt: ReceivedFunds, auditReason: string) => Promise<unknown>
  onReject: (reason: string, auditReason: string) => Promise<unknown>
}) {
  useUiLanguage()
  const [value, setValue] = useState('')
  const [auditReason, setAuditReason] = useState('')
  const [attempted, setAttempted] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [missing, setMissing] = useState(false)
  const [amount, setAmount] = useState('')
  const [receivedAt, setReceivedAt] = useState('')
  const reject = decision === 'reject'
  const balance = payment.amount.amountTtc - payment.receivedTtc
  const receivedAmountTtc = amount.trim() ? parseDh(amount) : undefined
  const invalidAmount =
    receivedAmountTtc === null ||
    (receivedAmountTtc !== undefined && (receivedAmountTtc < 1 || receivedAmountTtc > balance))
  const submit = async () => {
    const text = value.trim()
    setAttempted(true)
    setMissing(reject && !text)
    if ((reject && !text) || !auditReason.trim() || (!reject && invalidAmount)) return
    setPending(true)
    setError(null)
    try {
      if (reject) await onReject(text, auditReason.trim())
      else
        await onConfirm(
          {
            ...(text ? { receivedReference: text } : {}),
            ...(receivedAmountTtc ? { receivedAmountTtc } : {}),
            ...(receivedAt ? { receivedAt: new Date(receivedAt).toISOString() } : {}),
          },
          auditReason.trim(),
        )
      onClose()
    } catch (failure) {
      setError(failure)
      setAttempted(false)
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
                : 'Records the funds received. The subscription is activated or extended once the full amount is received. This cannot be undone.',
            )}
          </DialogDescription>
          <dl className="grid grid-cols-2 gap-2 rounded-xl bg-[var(--accent-soft)] p-3 text-sm">
            <dt className="text-[var(--muted)]">{translate('Customer')}</dt>
            <dd className="break-all font-semibold">{payment.ownerEmail}</dd>
            <dt className="text-[var(--muted)]">{translate('Reference')}</dt>
            <dd className="break-all font-semibold">{payment.reference}</dd>
            <dt className="text-[var(--muted)]">{translate('Total incl. tax')}</dt>
            <dd className="font-semibold">{formatDh(payment.amount.amountTtc)}</dd>
            {payment.receivedTtc > 0 && (
              <>
                <dt className="text-[var(--muted)]">{translate('Already received')}</dt>
                <dd className="font-semibold">{formatDh(payment.receivedTtc)}</dd>
              </>
            )}
            {payment.quoteExpiresAt && (
              <>
                <dt className="text-[var(--muted)]">{translate('Quote valid until')}</dt>
                <dd className="font-semibold">{displayDateTime(payment.quoteExpiresAt)}</dd>
              </>
            )}
          </dl>
          {reject && payment.receivedTtc > 0 && (
            <p role="note" className="text-sm text-[var(--error-text)]">
              {translate(
                '{{amount}} were already received. Rejecting issues a credit note for the whole invoice; the received amount must be refunded outside the platform.',
                { amount: formatDh(payment.receivedTtc) },
              )}
            </p>
          )}
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
            <>
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
                <p className="text-xs text-[var(--muted)]">
                  {translate('Each receipt needs its own reference.')}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="received-amount">{translate('Amount received (optional)')}</Label>
                  <Input
                    id="received-amount"
                    inputMode="decimal"
                    value={amount}
                    placeholder={formatDh(balance)}
                    aria-invalid={invalidAmount}
                    aria-describedby="received-amount-hint"
                    onChange={(event) => setAmount(event.target.value)}
                  />
                  <p
                    id="received-amount-hint"
                    role={invalidAmount ? 'alert' : undefined}
                    className={`text-xs ${invalidAmount ? 'text-[var(--error-text)]' : 'text-[var(--muted)]'}`}
                  >
                    {translate('At most the remaining balance: {{amount}}', {
                      amount: formatDh(balance),
                    })}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="received-at">{translate('Received on (optional)')}</Label>
                  <Input
                    id="received-at"
                    type="datetime-local"
                    value={receivedAt}
                    onChange={(event) => setReceivedAt(event.target.value)}
                  />
                </div>
              </div>
            </>
          )}
          <div className="space-y-2">
            <Label htmlFor="payment-audit-reason">{translate('Reason (internal)')}</Label>
            <Textarea
              id="payment-audit-reason"
              value={auditReason}
              maxLength={500}
              aria-invalid={attempted && !auditReason.trim()}
              aria-describedby={
                attempted && !auditReason.trim() ? 'payment-audit-error' : 'payment-audit-hint'
              }
              onChange={(event) => setAuditReason(event.target.value)}
            />
            {attempted && !auditReason.trim() ? (
              <p id="payment-audit-error" role="alert" className="text-sm text-[var(--error-text)]">
                {translate('Indicate the reason for this action.')}
              </p>
            ) : (
              <p id="payment-audit-hint" className="text-xs text-[var(--muted)]">
                {translate('Kept in the audit log. Never shown to the customer.')}
              </p>
            )}
          </div>
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
