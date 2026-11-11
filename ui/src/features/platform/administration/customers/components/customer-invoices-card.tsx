import { useState } from 'react'

import {
  useCreateAdminCreditNote,
  useListAdminInvoices,
} from '../../../../../api/generated/administration/administration'
import type { BillingInvoice } from '../../../../../api/generated/models'
import { type DataColumn, DataTable } from '../../../../../components/management/data-table'
import { FormError } from '../../../../../components/management/form-error'
import { RequestState } from '../../../../../components/management/request-state'
import { Button } from '../../../../../components/ui/button'
import { Card, CardHeader, CardTitle } from '../../../../../components/ui/card'
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
import { BillingCustomerSummary } from '../../../subscriptions/components/billing-customer-summary'
import { formatDh, parseDh } from '../../../subscriptions/components/billing-format'
import { invoiceColumns } from '../../../subscriptions/components/invoice-columns'
import { InvoicePdfButton } from '../../../subscriptions/components/invoice-pdf-button'
import { useRefreshAdministration } from '../hooks/use-refresh-administration'

/** Issued invoices and credit notes of one customer, with explicit corrections. */
export function CustomerInvoicesCard({ ownerId }: { ownerId: string }) {
  useUiLanguage()
  const list = useListAdminInvoices({ ownerId }, { query: { retry: false } })
  const [correcting, setCorrecting] = useState<BillingInvoice | null>(null)
  const columns: DataColumn<BillingInvoice>[] = [
    ...invoiceColumns,
    {
      title: 'Billed to',
      render: (i) => <BillingCustomerSummary customer={i.customer} />,
    },
    {
      title: 'Actions',
      align: 'right',
      render: (i) => (
        <div className="flex flex-col items-end gap-2">
          <InvoicePdfButton invoice={i} scope="admin" />
          {i.kind === 'invoice' && i.creditedTtc < i.totals.amountTtc && (
            <Button size="sm" variant="outline" onClick={() => setCorrecting(i)}>
              {translate('Credit note')}
            </Button>
          )}
        </div>
      ),
    },
  ]
  return (
    <section aria-label={translate('Invoices')}>
      <Card className="gap-0 overflow-hidden p-0">
        <CardHeader className="border-b border-[var(--border)] p-4">
          <CardTitle>{translate('Invoices')}</CardTitle>
        </CardHeader>
        {list.isPending || list.isError ? (
          <div className="p-4">
            <RequestState query={list} />
          </div>
        ) : (
          <DataTable
            items={list.data.items.map((item) => item.invoice)}
            columns={columns}
            emptyTitle={translate('No invoices yet.')}
            emptyDescription={translate('An invoice is issued at the first verified receipt.')}
          />
        )}
      </Card>
      {correcting && (
        <CreditNoteDialog
          key={correcting.id}
          invoice={correcting}
          onClose={() => setCorrecting(null)}
        />
      )}
    </section>
  )
}

function CreditNoteDialog({ invoice, onClose }: { invoice: BillingInvoice; onClose: () => void }) {
  useUiLanguage()
  const create = useCreateAdminCreditNote()
  const refresh = useRefreshAdministration()
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [auditReason, setAuditReason] = useState('')
  const [attempted, setAttempted] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const amountHt = parseDh(amount)
  const invalid = !amountHt || !reason.trim() || !auditReason.trim()
  const submit = async () => {
    setAttempted(true)
    if (invalid || !amountHt) return
    setError(null)
    try {
      await create.mutateAsync({
        invoiceId: invoice.id,
        data: { amountHt, reason: reason.trim(), auditReason: auditReason.trim() },
      })
      await refresh()
      onClose()
    } catch (failure) {
      setError(failure)
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && !create.isPending && onClose()}>
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
          <DialogTitle>{translate('Issue a credit note')}</DialogTitle>
          <DialogDescription>
            {translate(
              'The credit note is linked to {{number}} and shown to the customer. It does not change the subscription; refunds happen outside the platform. This cannot be undone.',
              { number: invoice.number },
            )}
          </DialogDescription>
          <dl className="grid grid-cols-2 gap-2 rounded-xl bg-[var(--accent-soft)] p-3 text-sm">
            <dt className="text-[var(--muted)]">{translate('Total incl. tax')}</dt>
            <dd className="font-semibold">{formatDh(invoice.totals.amountTtc)}</dd>
            <dt className="text-[var(--muted)]">{translate('Already credited')}</dt>
            <dd className="font-semibold">{formatDh(invoice.creditedTtc)}</dd>
          </dl>
          <div className="space-y-2">
            <Label htmlFor="credit-amount">{translate('Amount excluding tax')}</Label>
            <Input
              id="credit-amount"
              inputMode="decimal"
              value={amount}
              aria-invalid={attempted && !amountHt}
              onChange={(event) => setAmount(event.target.value)}
            />
            <p className="text-xs text-[var(--muted)]">
              {translate('Tax is added at the invoice rate.')}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="credit-reason">{translate('Reason shown to the customer')}</Label>
            <Textarea
              id="credit-reason"
              value={reason}
              maxLength={500}
              aria-invalid={attempted && !reason.trim()}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="credit-audit-reason">{translate('Reason (internal)')}</Label>
            <Textarea
              id="credit-audit-reason"
              value={auditReason}
              maxLength={500}
              aria-invalid={attempted && !auditReason.trim()}
              onChange={(event) => setAuditReason(event.target.value)}
            />
          </div>
          {attempted && invalid && (
            <p role="alert" className="text-sm text-[var(--error-text)]">
              {translate('Enter a valid amount and both reasons.')}
            </p>
          )}
          <FormError error={error} />
          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="outline" disabled={create.isPending} onClick={onClose}>
              {translate('Cancel')}
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? translate('Please wait…') : translate('Issue credit note')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
