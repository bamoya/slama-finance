import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Save } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Redirect, useLocation, useParams, useSearchParams } from 'wouter'

import {
  type DeliveryNote,
  type DeliveryNoteInput,
  DeliveryNoteInputSchema,
  DeliveryNoteUpdateSchema,
} from '../../../../api/generated/schemas/sales/delivery-notes.schemas'
import { FormActionBar } from '../../../../components/management/form-action-bar'
import { FormError } from '../../../../components/management/form-error'
import { PageHeader } from '../../../../components/management/page-header'
import { RequestState } from '../../../../components/management/request-state'
import { Button, buttonVariants } from '../../../../components/ui/button'
import { Input } from '../../../../components/ui/input'
import { Switch } from '../../../../components/ui/switch'
import { validationMessage } from '../../../../lib/error-messages'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { ClientPicker } from '../../components/client-picker'
import { SourceInvoicePicker } from '../../components/source-invoice-picker'
import { DeliveryLinesEditor } from '../components/delivery-lines-editor'
import { refreshDeliveries, useDeliveryActions, useDeliveryNote } from '../queries'
import { useDeliveryAddressDefault } from '../use-delivery-address-default'

const today = () => new Date().toISOString().slice(0, 10)
const blankLine = (): DeliveryNoteInput['lines'][number] => ({
  productVariantId: null,
  sourceInvoiceLineId: null,
  productName: '',
  quantity: 1,
})
const empty: DeliveryNoteInput = {
  clientId: '',
  invoiceId: null,
  deliveryDate: today(),
  deliveryAddress: '',
  instructions: null,
  includeReceptionSignature: true,
  lines: [blankLine()],
}
const fromNote = (note: DeliveryNote): DeliveryNoteInput => ({
  clientId: note.clientId,
  invoiceId: note.invoiceId,
  deliveryDate: note.deliveryDate,
  deliveryAddress: note.deliveryAddress,
  instructions: note.instructions,
  includeReceptionSignature: note.includeReceptionSignature,
  lines: note.lines.map((line) => ({
    productVariantId: line.productVariantId,
    sourceInvoiceLineId: line.sourceInvoiceLineId,
    productName: line.productName,
    quantity: line.quantity,
  })),
})

export function DeliveryNoteFormPage() {
  useUiLanguage()

  const { noteId } = useParams<{ noteId?: string }>()
  const query = useDeliveryNote(noteId ?? '', Boolean(noteId))
  if (noteId && query.data && query.data.status !== 'draft')
    return <Redirect to={`/delivery-notes/${noteId}`} />
  if (noteId && (query.isPending || query.isError))
    return (
      <div className="mx-auto max-w-[1500px] p-page">
        <RequestState query={query} />
      </div>
    )
  return <Editor key={noteId ?? 'new'} note={noteId ? query.data! : null} />
}

function Editor({ note }: { note: DeliveryNote | null }) {
  useUiLanguage()

  const { t } = useTranslation('sales')
  const [, navigate] = useLocation()
  const [params] = useSearchParams()
  const clientId = params.get('clientId') ?? ''
  const cache = useQueryClient()
  const actions = useDeliveryActions()
  const [error, setError] = useState<unknown>()
  const [issues, setIssues] = useState<string[]>([])
  const form = useForm({
    defaultValues: note
      ? fromNote(note)
      : {
          ...empty,
          clientId: DeliveryNoteInputSchema.shape.clientId.safeParse(clientId).success
            ? clientId
            : '',
        },
    onSubmit: async ({ value }) => {
      setError(undefined)
      const parsed = note
        ? DeliveryNoteUpdateSchema.safeParse({ ...value, expectedVersion: note.version })
        : DeliveryNoteInputSchema.safeParse(value)
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
        const saved = note
          ? await actions.update(
              note.id,
              DeliveryNoteUpdateSchema.parse({ ...value, expectedVersion: note.version }),
            )
          : await actions.create(DeliveryNoteInputSchema.parse(value))
        await refreshDeliveries(cache)
        navigate(`/delivery-notes/${saved.id}`)
      } catch (cause) {
        setError(cause)
      }
    },
  })
  const addressDefault = useDeliveryAddressDefault(
    !note && DeliveryNoteInputSchema.shape.clientId.safeParse(clientId).success ? clientId : null,
    (address) => form.setFieldValue('deliveryAddress', address),
  )
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <Link
        href={note ? `/delivery-notes/${note.id}` : '/delivery-notes'}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--muted)]"
      >
        <ArrowLeft size={16} /> {translate('Back to delivery notes')}
      </Link>
      <PageHeader
        eyebrow={translate('Sales')}
        title={note ? translate('Edit delivery note') : translate('Create delivery note')}
        description={translate('Draft product quantities first, then prepare the printable note.')}
      />
      <form
        id="delivery-note-form-page"
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
              <h2 className="text-lg font-bold">{translate('Delivery details')}</h2>
              <form.Field name="clientId">
                {(field) => (
                  <label className="grid gap-2 text-sm font-medium">
                    {translate('Client')}
                    <ClientPicker
                      value={field.state.value}
                      onValueChange={(value) => {
                        if (value === field.state.value) return
                        field.handleChange(value)
                        form.setFieldValue('deliveryAddress', '')
                        addressDefault.selectClient(value)
                        form.setFieldValue('invoiceId', null)
                        form.setFieldValue('lines', [blankLine()])
                      }}
                      selectedLabel={note?.clientDisplayName}
                    />
                  </label>
                )}
              </form.Field>
              <form.Subscribe selector={(state) => state.values.clientId}>
                {(clientId) => (
                  <form.Field name="invoiceId">
                    {(field) => (
                      <label className="grid gap-2 text-sm font-medium">
                        {translate('Source invoice (optional)')}
                        <SourceInvoicePicker
                          clientId={clientId}
                          value={field.state.value ?? ''}
                          onValueChange={(value) => {
                            field.handleChange(value || null)
                            form.setFieldValue('lines', [blankLine()])
                          }}
                          selectedLabel={note?.invoiceNumber ?? undefined}
                        />
                      </label>
                    )}
                  </form.Field>
                )}
              </form.Subscribe>
              <form.Field name="deliveryDate">
                {(field) => (
                  <label className="grid gap-2 text-sm font-medium">
                    {translate('Delivery date')}
                    <Input
                      type="date"
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                    />
                  </label>
                )}
              </form.Field>
              <form.Field name="deliveryAddress">
                {(field) => (
                  <label className="grid gap-2 text-sm font-medium">
                    {translate('Delivery address')}
                    <Input
                      value={field.state.value}
                      onChange={(event) => {
                        addressDefault.keepCustomAddress()
                        field.handleChange(event.target.value)
                      }}
                    />
                  </label>
                )}
              </form.Field>
            </section>
            <form.Subscribe
              selector={(state) => [state.values.clientId, state.values.invoiceId] as const}
            >
              {([client, invoiceId]) => (
                <form.Field name="lines">
                  {(field) => (
                    <DeliveryLinesEditor
                      key={client + ':' + invoiceId}
                      invoiceId={invoiceId}
                      lines={field.state.value}
                      onChange={field.handleChange}
                    />
                  )}
                </form.Field>
              )}
            </form.Subscribe>
          </div>
          <div className="grid content-start gap-section">
            <section className="grid gap-4 rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
              <h2 className="text-lg font-bold">{translate('Reception')}</h2>
              <form.Field name="instructions">
                {(field) => (
                  <label className="grid gap-2 text-sm font-medium">
                    {translate('Instructions')}
                    <Input
                      value={field.state.value ?? ''}
                      onChange={(event) => field.handleChange(event.target.value || null)}
                    />
                  </label>
                )}
              </form.Field>
              <form.Field name="includeReceptionSignature">
                {(field) => (
                  <label className="flex items-center gap-3 text-sm font-medium">
                    <Switch
                      checked={field.state.value}
                      onCheckedChange={field.handleChange}
                      onBlur={field.handleBlur}
                    />
                    {t('includeReceptionSignature')}
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
            href={note ? `/delivery-notes/${note.id}` : '/delivery-notes'}
            className={buttonVariants({ variant: 'outline' })}
          >
            {t('cancel')}
          </Link>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(pending) => (
              <Button type="submit" form="delivery-note-form-page" disabled={pending}>
                <Save size={16} /> {t('saveDraft')}
              </Button>
            )}
          </form.Subscribe>
        </FormActionBar>
      </form>
    </div>
  )
}
