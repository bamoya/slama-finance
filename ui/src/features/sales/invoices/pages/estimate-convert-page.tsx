import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, FilePlus2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useParams } from 'wouter'

import { FormActionBar } from '../../../../components/management/form-action-bar'
import { FormError } from '../../../../components/management/form-error'
import { PageHeader } from '../../../../components/management/page-header'
import { RequestState } from '../../../../components/management/request-state'
import { Button, buttonVariants } from '../../../../components/ui/button'
import { Input } from '../../../../components/ui/input'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { refreshEstimates, useEstimate } from '../../estimates/queries'
import { refreshInvoices, useEstimateInvoices, useInvoiceActions } from '../queries'

export function EstimateConvertPage() {
  useUiLanguage()

  const { t } = useTranslation('sales')
  const { documentId = '' } = useParams<{ documentId: string }>()
  const [, navigate] = useLocation()
  const cache = useQueryClient()
  const estimate = useEstimate(documentId)
  const linked = useEstimateInvoices(documentId)
  const actions = useInvoiceActions()
  const [operationId] = useState(() => crypto.randomUUID())
  const [dueDate, setDueDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  if (estimate.isPending || estimate.isError)
    return (
      <div className="mx-auto max-w-[1500px] p-page">
        <RequestState query={estimate} />
      </div>
    )
  const row = estimate.data
  const create = async () => {
    setBusy(true)
    setError(undefined)
    try {
      const invoice = await actions.convert(row.id, operationId, dueDate || null)
      await Promise.all([refreshInvoices(cache), refreshEstimates(cache)])
      navigate(`/invoices/${invoice.id}`)
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <Link
        href={`/estimates/${row.id}`}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--muted)]"
      >
        <ArrowLeft size={16} /> {translate('Back to estimate')}
      </Link>
      <PageHeader
        eyebrow={translate('Sales')}
        title={translate('Create invoice from estimate')}
        description={translate(
          'The new invoice is a draft. Previous invoices remain linked to this estimate.',
        )}
      />
      <FormError error={error} />
      <div className="grid gap-section lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <section className="grid gap-4 rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
          <h2 className="text-lg font-bold">{translate('Source estimate')}</h2>
          <p>
            {row.number ?? translate('Draft')} · {row.total} {row.currency}
          </p>
          <p className="text-sm text-[var(--muted)]">
            {translate('Status:')} {row.status}
          </p>
          <h3 className="mt-2 font-semibold">{translate('Previous invoices')}</h3>
          {linked.isPending ? (
            <p className="text-sm text-[var(--muted)]">{translate('Loading…')}</p>
          ) : linked.data?.length ? (
            <ul className="grid gap-2">
              {linked.data.map((invoice) => (
                <li key={invoice.id}>
                  <Link href={`/invoices/${invoice.id}`} className="text-[var(--accent)]">
                    {invoice.number ?? translate('Draft invoice')} · {invoice.status}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--muted)]">
              {translate('No invoices created from this estimate yet.')}
            </p>
          )}
        </section>
        <section className="grid content-start gap-4 rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
          <h2 className="text-lg font-bold">{translate('New invoice')}</h2>
          <label className="grid gap-2 text-sm font-medium">
            {translate('Due date (optional)')}
            <Input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </label>
          <p className="text-xs text-[var(--muted)]">
            {translate(
              'Leave blank to use the company payment term. You can edit the draft before issuing it.',
            )}
          </p>
          {row.status !== 'accepted' && (
            <p className="text-sm text-[var(--error-text)]">
              {translate('Accept the estimate before conversion.')}
            </p>
          )}
        </section>
      </div>
      <FormActionBar>
        <Link href={`/estimates/${row.id}`} className={buttonVariants({ variant: 'outline' })}>
          {t('cancel')}
        </Link>
        <Button disabled={busy || row.status !== 'accepted'} onClick={() => void create()}>
          <FilePlus2 size={16} /> {t('createInvoiceDraft')}
        </Button>
      </FormActionBar>
    </div>
  )
}
