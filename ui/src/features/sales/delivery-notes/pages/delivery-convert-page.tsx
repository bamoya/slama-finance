import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, FilePlus2, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useParams } from 'wouter'

import { DeliveryInvoiceConversionSchema } from '../../../../api/generated/schemas/sales/invoices.schemas'
import { FormActionBar } from '../../../../components/management/form-action-bar'
import { FormError } from '../../../../components/management/form-error'
import { PageHeader } from '../../../../components/management/page-header'
import { RequestState } from '../../../../components/management/request-state'
import { Button, buttonVariants } from '../../../../components/ui/button'
import { Combobox } from '../../../../components/ui/combobox'
import { Input } from '../../../../components/ui/input'
import { validationMessage } from '../../../../lib/error-messages'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { TemplatePicker } from '../../components/template-picker'
import { refreshInvoices, useInvoiceActions } from '../../invoices/queries'
import { refreshDeliveries, useDeliveryNote, useDeliveryNotes } from '../queries'

const today = () => new Date().toISOString().slice(0, 10)
const defaultDueDate = () => {
  const date = new Date()
  date.setDate(date.getDate() + 30)
  return date.toISOString().slice(0, 10)
}

export function DeliveryConvertPage() {
  useUiLanguage()

  const { noteId = '' } = useParams<{ noteId: string }>()
  const note = useDeliveryNote(noteId)
  if (note.isPending || note.isError)
    return (
      <div className="mx-auto max-w-[1500px] p-page">
        <RequestState query={note} />
      </div>
    )
  if (note.data.invoiceId || !['delivered', 'acknowledged'].includes(note.data.status))
    return (
      <div className="mx-auto max-w-[1500px] p-page">
        <PageHeader
          eyebrow={translate('Sales')}
          title={translate('Delivery not eligible')}
          description={translate('Only delivered, independent notes can be invoiced.')}
        />
        <Link href={`/delivery-notes/${noteId}`} className="text-[var(--accent)]">
          {translate('Back to delivery note')}
        </Link>
      </div>
    )
  return <Editor key={noteId} note={note.data} />
}

function Editor({ note }: { note: NonNullable<ReturnType<typeof useDeliveryNote>['data']> }) {
  useUiLanguage()

  const { t } = useTranslation('sales')
  const [, navigate] = useLocation()
  const cache = useQueryClient()
  const eligibleNotes = useDeliveryNotes({
    status: 'all',
    clientId: note.clientId,
    limit: 100,
    offset: 0,
  })
  const sourceNotes = eligibleNotes.data?.items.filter(
    (item) => !item.invoiceId && ['delivered', 'acknowledged'].includes(item.status),
  ) ?? [note]
  const sourceLines = sourceNotes.flatMap((item) =>
    item.lines.map((line) => ({ ...line, noteNumber: item.number })),
  )
  const actions = useInvoiceActions()
  const [error, setError] = useState<unknown>()
  const [issues, setIssues] = useState<string[]>([])
  const [operationId] = useState(() => crypto.randomUUID())
  const form = useForm({
    defaultValues: {
      operationId,
      templateId: null as string | null,
      issueDate: today(),
      dueDate: defaultDueDate(),
      notes: null as string | null,
      paymentTerms: null as string | null,
      lines: note.lines
        .filter((line) => line.remainingBillableQuantity > 0)
        .map((line) => ({
          deliveryNoteLineId: line.id,
          quantity: line.remainingBillableQuantity,
          unitPrice: '',
          vatRate: null as string | null,
        })),
    },
    onSubmit: async ({ value }) => {
      const parsed = DeliveryInvoiceConversionSchema.safeParse(value)
      if (!parsed.success) {
        setIssues(
          parsed.error.issues.map(
            (issue) => `${issue.path.join('.')}: ${validationMessage(issue.message)}`,
          ),
        )
        return
      }
      setIssues([])
      setError(undefined)
      try {
        const saved = await actions.convertDeliveries(parsed.data)
        await Promise.all([refreshInvoices(cache), refreshDeliveries(cache)])
        navigate(`/invoices/${saved.id}`)
      } catch (cause) {
        setError(cause)
      }
    },
  })
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <Link
        href={`/delivery-notes/${note.id}`}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--muted)]"
      >
        <ArrowLeft size={16} /> {translate('Back to delivery note')}
      </Link>
      <PageHeader
        eyebrow={translate('Sales')}
        title={translate('Invoice delivered products')}
        description={translate(
          'Confirm quantities and prices explicitly. VAT remains off unless you enter a rate.',
        )}
      />
      <form
        id="delivery-convert-page"
        className="grid gap-section"
        onSubmit={(event) => {
          event.preventDefault()
          if (!form.state.isSubmitting) void form.handleSubmit()
        }}
      >
        <section className="grid gap-4 rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
          <h2 className="text-lg font-bold">{translate('Invoice details')}</h2>
          <p className="text-sm text-[var(--muted)]">
            {translate('From')} {note.number} {translate('· same client as the delivery note')}
          </p>
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
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </label>
              )}
            </form.Field>
          </div>
          <form.Field name="templateId">
            {(field) => (
              <label className="grid gap-2 text-sm font-medium">
                {translate('PDF template')}
                <TemplatePicker value={field.state.value} onValueChange={field.handleChange} />
              </label>
            )}
          </form.Field>
        </section>
        <form.Field name="lines">
          {(field) => (
            <section className="grid gap-4 rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
              <h2 className="text-lg font-bold">{translate('Delivered products')}</h2>
              {field.state.value.map((line, index) => {
                const source = sourceLines.find((item) => item.id === line.deliveryNoteLineId)
                return (
                  <div
                    key={line.deliveryNoteLineId}
                    className="grid gap-3 rounded-2xl border border-[var(--border)] p-4 sm:grid-cols-[1fr_110px_120px_100px_40px]"
                  >
                    <span className="self-center text-sm font-semibold">
                      {source?.productName}
                      <small className="block font-normal text-[var(--muted)]">
                        {source?.noteNumber} · {source?.remainingBillableQuantity}{' '}
                        {translate('available')}
                      </small>
                    </span>
                    <label className="grid gap-1 text-xs">
                      {translate('Quantity')}
                      <Input
                        type="number"
                        min="1"
                        max={source?.remainingBillableQuantity}
                        value={line.quantity}
                        onChange={(event) =>
                          field.handleChange(
                            field.state.value.map((item, position) =>
                              position === index
                                ? { ...item, quantity: Number(event.target.value) }
                                : item,
                            ),
                          )
                        }
                      />
                    </label>
                    <label className="grid gap-1 text-xs">
                      {translate('Unit price (MAD)')}
                      <Input
                        inputMode="decimal"
                        value={line.unitPrice}
                        onChange={(event) =>
                          field.handleChange(
                            field.state.value.map((item, position) =>
                              position === index
                                ? { ...item, unitPrice: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </label>
                    <label className="grid gap-1 text-xs">
                      {translate('VAT %')}
                      <Input
                        inputMode="decimal"
                        placeholder={translate('Off')}
                        value={line.vatRate ?? ''}
                        onChange={(event) =>
                          field.handleChange(
                            field.state.value.map((item, position) =>
                              position === index
                                ? { ...item, vatRate: event.target.value || null }
                                : item,
                            ),
                          )
                        }
                      />
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      aria-label={translate('Remove {{value0}}', { value0: source?.productName })}
                      onClick={() =>
                        field.handleChange(
                          field.state.value.filter((_, position) => position !== index),
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                )
              })}
              <Combobox
                value=""
                onValueChange={(id) => {
                  const source = sourceLines.find((item) => item.id === id)
                  if (source)
                    field.handleChange([
                      ...field.state.value,
                      {
                        deliveryNoteLineId: source.id,
                        quantity: source.remainingBillableQuantity,
                        unitPrice: '',
                        vatRate: null,
                      },
                    ])
                }}
                options={sourceLines
                  .filter(
                    (item) =>
                      item.remainingBillableQuantity > 0 &&
                      !field.state.value.some(
                        (selected) => selected.deliveryNoteLineId === item.id,
                      ),
                  )
                  .map((item) => ({
                    value: item.id,
                    label: `${item.noteNumber} · ${item.productName} · ${t('availableQuantity', { quantity: item.remainingBillableQuantity })}`,
                    keywords: [item.productReference ?? ''],
                  }))}
                placeholder={t('addDeliveredProduct')}
                aria-label={t('addDeliveredProduct')}
              />
            </section>
          )}
        </form.Field>
        <section className="grid gap-4 rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
          <div className="grid gap-4 sm:grid-cols-2">
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
          </div>
        </section>
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
            href={`/delivery-notes/${note.id}`}
            className={buttonVariants({ variant: 'outline' })}
          >
            {t('cancel')}
          </Link>
          <form.Subscribe
            selector={(state) => [state.isSubmitting, state.values.lines.length] as const}
          >
            {([pending, lineCount]) => (
              <Button type="submit" form="delivery-convert-page" disabled={pending || !lineCount}>
                <FilePlus2 size={16} /> {t('createInvoiceDraft')}
              </Button>
            )}
          </form.Subscribe>
        </FormActionBar>
      </form>
    </div>
  )
}
