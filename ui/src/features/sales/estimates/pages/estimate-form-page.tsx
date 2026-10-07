import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Save } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Redirect, useLocation, useParams, useSearchParams } from 'wouter'

import {
  type Estimate,
  type EstimateInput,
  EstimateInputSchema,
  EstimateUpdateSchema,
} from '../../../../api/generated/schemas/sales/estimates.schemas'
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
import { EstimateLinesEditor } from '../components/estimate-lines-editor'
import { refreshEstimates, useEstimate, useEstimateActions } from '../queries'

const today = () => new Date().toISOString().slice(0, 10)
const empty: EstimateInput = {
  clientId: '',
  templateId: null,
  issueDate: today(),
  validUntil: null,
  notes: null,
  paymentTerms: null,
  lines: [],
}
const fromEstimate = (estimate: Estimate): EstimateInput => ({
  clientId: estimate.clientId,
  templateId: estimate.templateId,
  issueDate: estimate.issueDate,
  validUntil: estimate.validUntil,
  notes: estimate.notes,
  paymentTerms: estimate.paymentTerms,
  lines: estimate.lines.map((line) => ({
    productVariantId: line.productVariantId,
    productName: line.productName,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    vatRate: line.vatRate,
  })),
})

export function EstimateFormPage() {
  useUiLanguage()

  const { documentId } = useParams<{ documentId?: string }>()
  const query = useEstimate(documentId ?? '', Boolean(documentId))
  if (documentId && query.data && query.data.status !== 'draft')
    return <Redirect to={`/estimates/${documentId}`} />
  if (documentId && (query.isPending || query.isError))
    return (
      <div className="mx-auto max-w-[1500px] p-page">
        <RequestState query={query} />
      </div>
    )
  return <EstimateEditor key={documentId ?? 'new'} estimate={documentId ? query.data! : null} />
}

function EstimateEditor({ estimate }: { estimate: Estimate | null }) {
  useUiLanguage()

  const { t } = useTranslation('sales')
  const [, navigate] = useLocation()
  const [params] = useSearchParams()
  const clientId = params.get('clientId') ?? ''
  const cache = useQueryClient()
  const actions = useEstimateActions()
  const [error, setError] = useState<unknown>()
  const [issues, setIssues] = useState<string[]>([])
  const form = useForm({
    defaultValues: estimate
      ? fromEstimate(estimate)
      : {
          ...empty,
          clientId: EstimateInputSchema.shape.clientId.safeParse(clientId).success ? clientId : '',
        },
    onSubmit: async ({ value }) => {
      setError(undefined)
      const parsed = estimate
        ? EstimateUpdateSchema.safeParse({ ...value, expectedVersion: estimate.version })
        : EstimateInputSchema.safeParse(value)
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
        const saved = estimate
          ? await actions.update(
              estimate.id,
              EstimateUpdateSchema.parse({ ...value, expectedVersion: estimate.version }),
            )
          : await actions.create(EstimateInputSchema.parse(value))
        await refreshEstimates(cache)
        navigate(`/estimates/${saved.id}`)
      } catch (cause) {
        setError(cause)
      }
    },
  })
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <Link
        href={estimate ? `/estimates/${estimate.id}` : '/estimates'}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--muted)]"
      >
        <ArrowLeft size={16} /> {translate('Back to estimates')}
      </Link>
      <PageHeader
        eyebrow={translate('Sales')}
        title={estimate ? translate('Edit estimate') : translate('Create estimate')}
        description={translate('Save the draft before issuing a fixed quotation PDF.')}
      />
      <form
        id="estimate-form-page"
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
              <h2 className="text-lg font-bold">{translate('Estimate details')}</h2>
              <form.Field name="clientId">
                {(field) => (
                  <label className="grid gap-2 text-sm font-medium">
                    {translate('Client')}
                    <ClientPicker
                      enabled={!estimate?.revisionOfId}
                      value={field.state.value}
                      onValueChange={field.handleChange}
                      selectedLabel={estimate?.clientDisplayName}
                    />
                  </label>
                )}
              </form.Field>
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
                <form.Field name="validUntil">
                  {(field) => (
                    <label className="grid gap-2 text-sm font-medium">
                      {translate('Valid until')}
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
            className="rounded-2xl border border-[var(--destructive)] p-4 text-sm text-[var(--destructive)]"
          >
            {issues.map((issue) => (
              <p key={issue}>{issue}</p>
            ))}
          </div>
        )}
        <FormError error={error} />
        <FormActionBar>
          <Link
            href={estimate ? `/estimates/${estimate.id}` : '/estimates'}
            className={buttonVariants({ variant: 'outline' })}
          >
            {t('cancel')}
          </Link>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(pending) => (
              <Button type="submit" form="estimate-form-page" disabled={pending}>
                <Save size={16} /> {t('saveDraft')}
              </Button>
            )}
          </form.Subscribe>
        </FormActionBar>
      </form>
    </div>
  )
}
