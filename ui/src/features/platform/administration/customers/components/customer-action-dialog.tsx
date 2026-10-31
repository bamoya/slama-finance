import { type ReactNode, useState } from 'react'

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
import { TwoFactorCodeField } from '../../shared/components/two-factor-code-field'

export type ActionInput = { reason: string; code: string }

/**
 * Shared shell of every customer lifecycle action: states the impact, collects the internal
 * reason, asks for a fresh authenticator code when the action is sensitive and, for deletion,
 * the customer email typed back.
 */
export function CustomerActionDialog({
  title,
  description,
  impacts,
  sensitive = false,
  destructive = false,
  submitLabel,
  confirmEmail,
  fields,
  fieldsReady = true,
  onClose,
  onSubmit,
}: {
  title: string
  description: string
  impacts: string[]
  sensitive?: boolean
  destructive?: boolean
  submitLabel: string
  /** When set, the action stays disabled until this exact email is typed. */
  confirmEmail?: string
  fields?: ReactNode
  fieldsReady?: boolean
  onClose: () => void
  onSubmit: (input: ActionInput) => Promise<unknown>
}) {
  useUiLanguage()
  const [reason, setReason] = useState('')
  const [code, setCode] = useState('')
  const [typedEmail, setTypedEmail] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [attempted, setAttempted] = useState(false)
  const reasonMissing = attempted && !reason.trim()
  const codeInvalid = attempted && sensitive && !/^\d{6}$/.test(code)
  const emailMatches = confirmEmail === undefined || typedEmail.trim() === confirmEmail
  const submit = async () => {
    setAttempted(true)
    if (!reason.trim() || (sensitive && !/^\d{6}$/.test(code)) || !emailMatches || !fieldsReady)
      return
    setPending(true)
    setError(null)
    try {
      await onSubmit({ reason: reason.trim(), code })
      onClose()
    } catch (failure) {
      setError(failure)
      setAttempted(false)
      if (sensitive) setCode('')
    } finally {
      setPending(false)
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent
        className={`max-h-[calc(100dvh-2rem)] overflow-y-auto ${document.documentElement.classList.contains('theme-dark') ? 'is-dark' : ''}`}
      >
        <form
          className="flex flex-col gap-content"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
          <section
            aria-label={translate('Impact')}
            className="rounded-xl bg-[var(--accent-soft)] p-3 text-sm"
          >
            <p className="mb-2 font-semibold">{translate('What will happen')}</p>
            <ul className="list-disc space-y-1 pl-5">
              {impacts.map((impact) => (
                <li key={impact}>{impact}</li>
              ))}
            </ul>
          </section>
          {fields}
          <div className="space-y-2">
            <Label htmlFor="action-reason">{translate('Reason (internal)')}</Label>
            <Textarea
              id="action-reason"
              value={reason}
              maxLength={500}
              aria-invalid={reasonMissing}
              aria-describedby={reasonMissing ? 'action-reason-error' : 'action-reason-hint'}
              onChange={(event) => setReason(event.target.value)}
            />
            {reasonMissing ? (
              <p id="action-reason-error" role="alert" className="text-sm text-[var(--error-text)]">
                {translate('Indicate the reason for this action.')}
              </p>
            ) : (
              <p id="action-reason-hint" className="text-xs text-[var(--muted)]">
                {translate('Kept in the audit log. Never shown to the customer.')}
              </p>
            )}
          </div>
          {confirmEmail !== undefined && (
            <div className="space-y-2">
              <Label htmlFor="action-confirm-email">
                {translate('Type the customer email to confirm')}
              </Label>
              <p className="break-all text-sm font-semibold">{confirmEmail}</p>
              <Input
                id="action-confirm-email"
                type="email"
                autoComplete="off"
                value={typedEmail}
                onChange={(event) => setTypedEmail(event.target.value)}
              />
            </div>
          )}
          {sensitive && (
            <TwoFactorCodeField
              value={code}
              onChange={setCode}
              invalid={codeInvalid}
              disabled={pending}
            />
          )}
          <FormError error={error} />
          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
              {translate('Cancel')}
            </Button>
            <Button
              type="submit"
              variant={destructive ? 'destructive' : 'default'}
              disabled={pending || !emailMatches}
            >
              {pending ? translate('Please wait…') : submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
