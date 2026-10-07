import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Save } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Redirect, useLocation, useParams, useSearchParams } from 'wouter'

import {
  type Invoice,
  type InvoiceInput,
  InvoiceInputSchema,
  InvoiceUpdateSchema,
} from '../../../../api/generated/schemas/sales/invoices.schemas'
import { FormActionBar } from '../../../../components/management/form-action-bar'
import { FormError } from '../../../../components/management/form-error'
import { PageHeader } from '../../../../components/management/page-header'
import { RequestState } from '../../../../components/management/request-state'
import { Button, buttonVariants } from '../../../../components/ui/button'
import { Input } from '../../../../components/ui/input'
import { validationMessage } from '../../../../lib/error-messages'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { ClientPicker } from '../../components/client-picker'
import { TemplatePicker } from '../../components/template-picker'
import { EstimateLinesEditor } from '../../estimates/components/estimate-lines-editor'
import { refreshInvoices, useInvoice, useInvoiceActions } from '../queries'

const today = () => new Date().toISOString().slice(0, 10)
const empty: InvoiceInput = {
  clientId: '',
  templateId: null,
  issueDate: today(),
  dueDate: null,
  notes: null,
  paymentTerms: null,
  lines: [],
}
const fromInvoice = (invoice: Invoice): InvoiceInput => ({
  clientId: invoice.clientId,
  templateId: invoice.templateId,
  issueDate: invoice.issueDate,
  dueDate: invoice.dueDate,
  notes: invoice.notes,
  paymentTerms: invoice.paymentTerms,
  lines: invoice.lines.map((line) => ({
    productVariantId: line.productVariantId,
    productName: line.productName,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    vatRate: line.vatRate,
  })),
})

export function InvoiceFormPage() {
  useUiLanguage()

  const { documentId } = useParams<{ documentId?: string }>()
  const query = useInvoice(documentId ?? '', Boolean(documentId))
  if (documentId && query.data && query.data.status !== 'draft')
    return <Redirect to={`/invoices/${documentId}`} />
  if (documentId && (query.isPending || query.isError))
    return (
      <div className="mx-auto max-w-[1500px] p-page">
        <RequestState query={query} />
      </div>
    )
  if (documentId && query.data?.deliveryNoteIds.length)
    return (
      <div className="mx-auto grid max-w-[1500px] gap-4 p-page">
        <PageHeader
          eyebrow={translate('Sales')}
          title={translate('Invoice linked to deliveries')}
          description={translate(
            'Delivery-derived invoice lines are locked to preserve billed quantities.',
          )}
        />
        <Link href={`/invoices/${documentId}`} className="text-[var(--accent)]">
          {translate('Back to invoice')}
        </Link>
      </div>
    )
  return <InvoiceEditor key={documentId ?? 'new'} invoice={documentId ? query.data! : null} />
}

function InvoiceEditor({ invoice }: { invoice: Invoice | null }) {
  useUiLanguage()

  const { t } = useTranslation('sales')
  const [, navigate] = useLocation()
  const [params] = useSearchParams()
  const clientId = params.get('clientId') ?? ''
  const cache = useQueryClient()
  const actions = useInvoiceActions()
  const [error, setError] = useState<unknown>()
  const [issues, setIssues] = useState<string[]>([])
  const form = useForm({
    defaultValues: invoice
      ? fromInvoice(invoice)
      : {
          ...empty,
          clientId: InvoiceInputSchema.shape.clientId.safeParse(clientId).success ? clientId : '',
        },
    onSubmit: async ({ value }) => {
      setError(undefined)
      const parsed = invoice
        ? InvoiceUpdateSchema.safeParse({ ...value, expectedVersion: invoice.version })
        : InvoiceInputSchema.safeParse(value)
      if (!parsed.success) {
        setIssues(
          parsed.error.issues.map(
            (issue) => `${issue.path.join('.')}: ${validationMessage(issue.message)}`,
          ),
        )
        return
      }
      setIssues([])
      try {
        const saved = invoice
          ? await actions.update(
              invoice.id,
              InvoiceUpdateSchema.parse({ ...value, expectedVersion: invoice.version }),
            )
          : await actions.create(InvoiceInputSchema.parse(value))
        await refreshInvoices(cache)
        navigate(`/invoices/${saved.id}`)
      } catch (cause) {
        setError(cause)
      }
    },
  })
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <Link
        href={invoice ? `/invoices/${invoice.id}` : '/invoices'}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--muted)]"
      >
        <ArrowLeft size={16} /> {translate('Back to invoices')}
      </Link>
      <PageHeader
        eyebrow={translate('Sales')}
        title={invoice ? translate('Edit invoice') : translate('Create invoice')}
        description={translate('Save a draft, review it, then issue the final invoice.')}
      />
      <form
        id="invoice-form-page"
        noValidate
        className="grid gap-section"
        onSubmit={(event) => {
          event.preventDefault()
          if (!form.state.isSubmitting) void form.handleSubmit()
        }}
      >
        <div className="grid gap-section lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
          <div className="grid content-start gap-section">
            <section className="grid gap-4 rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
              <h2 className="text-lg font-bold">{translate('Invoice details')}</h2>
              <form.Field name="clientId">
                {(field) => (
                  <label className="grid gap-2 text-sm font-medium">
                    {translate('Client')}
                    <ClientPicker
                      value={field.state.value}
                      onValueChange={field.handleChange}
                      selectedLabel={invoice?.clientDisplayName}
                    />
                  </label>
                )}
              </form.Field>
              {invoice?.sourceEstimateId && (
                <Link
                  href={`/estimates/${invoice.sourceEstimateId}`}
                  className="text-sm text-[var(--accent)]"
                >
                  {translate('Created from estimate · View source')}
                </Link>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <form.Field name="issueDate">
                  {(field) => (
                    <label className="grid gap-2 text-sm font-medium">
                      {translate('Issue date')}
                      <Input
                        type="date"
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                      />
                    </label>
                  )}
                </form.Field>
                <form.Field name="dueDate">
                  {(field) => (
                    <label className="grid gap-2 text-sm font-medium">
                      {translate('Due date')}
                      <Input
                        type="date"
                        value={field.state.value ?? ''}
                        onChange={(event) => field.handleChange(event.target.value || null)}
                      />
                    </label>
                  )}
                </form.Field>
              </div>
            </section>
            <form.Field name="lines">
              {(field) => (
                <EstimateLinesEditor lines={field.state.value} onChange={field.handleChange} />
              )}
            </form.Field>
          </div>
          <div className="grid content-start gap-section">
            <section className="grid gap-4 rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
              <h2 className="text-lg font-bold">{translate('Appearance & terms')}</h2>
              <form.Field name="templateId">
                {(field) => (
                  <label className="grid gap-2 text-sm font-medium">
                    {translate('PDF template')}
                    <TemplatePicker value={field.state.value} onValueChange={field.handleChange} />
                  </label>
                )}
              </form.Field>
              <form.Field name="paymentTerms">
                {(field) => (
                  <label className="grid gap-2 text-sm font-medium">
                    {translate('Payment terms')}
                    <Input
                      value={field.state.value ?? ''}
                      onChange={(event) => field.handleChange(event.target.value || null)}
                    />
                  </label>
                )}
              </form.Field>
              <form.Field name="notes">
                {(field) => (
                  <label className="grid gap-2 text-sm font-medium">
                    {translate('Notes')}
                    <Input
                      value={field.state.value ?? ''}
                      onChange={(event) => field.handleChange(event.target.value || null)}
                    />
                  </label>
                )}
              </form.Field>
            </section>
          </div>
        </div>
        {issues.length > 0 && (
          <div
            role="alert"
            className="rounded-2xl border border-[var(--error-border)] bg-[var(--error-bg)] p-4 text-sm text-[var(--error-text)]"
          >
            {issues.map((issue) => (
              <p key={issue}>{issue}</p>
            ))}
          </div>
        )}
        <FormError error={error} />
        <FormActionBar>
          <Link
            href={invoice ? `/invoices/${invoice.id}` : '/invoices'}
            className={buttonVariants({ variant: 'outline' })}
          >
            {t('cancel')}
          </Link>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(pending) => (
              <Button type="submit" form="invoice-form-page" disabled={pending}>
                <Save size={16} /> {t('saveDraft')}
              </Button>
            )}
          </form.Subscribe>
        </FormActionBar>
      </form>
    </div>
  )
}
