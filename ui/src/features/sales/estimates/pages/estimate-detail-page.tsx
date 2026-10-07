import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Download, Pencil, Send, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useParams } from 'wouter'

import { EstimateCancellationSchema } from '../../../../api/generated/schemas/sales/estimates.schemas'
import { CancellationDialog } from '../../../../components/management/cancellation-dialog'
import { ConfirmAction } from '../../../../components/management/confirm-action'
import { FormError } from '../../../../components/management/form-error'
import { MoreAction, MoreActions } from '../../../../components/management/more-actions'
import { PageHeader } from '../../../../components/management/page-header'
import { RequestState } from '../../../../components/management/request-state'
import { StatusBadge } from '../../../../components/management/status-badge'
import { Button, buttonVariants } from '../../../../components/ui/button'
import { uiLocale } from '../../../../lib/i18n'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { Can, useAuthorization } from '../../../identity'
import { RegeneratePdfDialog } from '../../components/regenerate-pdf-dialog'
import { useEstimateInvoices } from '../../invoices/queries'
import { DocumentNotificationHistory } from '../../notifications/components/document-notification-history'
import { SendDocumentDialog } from '../../notifications/components/send-document-dialog'
import { EstimateRevisionAction } from '../components/estimate-revision-action'
import { refreshEstimates, useEstimate, useEstimateActions, useEstimateArtifacts } from '../queries'

export function EstimateDetailPage() {
  useUiLanguage()

  const { t } = useTranslation('sales')
  const { documentId = '' } = useParams<{ documentId: string }>()
  const [, navigate] = useLocation()
  const cache = useQueryClient()
  const { can } = useAuthorization()
  const estimate = useEstimate(documentId)
  const artifacts = useEstimateArtifacts(
    documentId,
    Boolean(estimate.data && estimate.data.status !== 'draft'),
  )
  const linked = useEstimateInvoices(
    documentId,
    Boolean(estimate.data && estimate.data.status !== 'draft' && can('invoices.read')),
  )
  const actions = useEstimateActions()
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  if (estimate.isPending || estimate.isError)
    return (
      <div className="mx-auto max-w-[1500px] p-page">
        <RequestState query={estimate} />
      </div>
    )
  const row = estimate.data
  const act = async (action: () => Promise<unknown>, after?: () => void) => {
    setBusy(true)
    setError(undefined)
    try {
      await action()
      await refreshEstimates(cache)
      after?.()
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
    }
  }
  const download = async () => {
    const file = artifacts.data?.at(-1)
    if (!file) return act(() => actions.preparePdf(row.id))
    return act(async () => {
      const blob = await actions.downloadPdf(file.id)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${row.number ?? 'estimate'}.pdf`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    })
  }
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <Link
        href="/estimates"
        className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--muted)]"
      >
        <ArrowLeft size={16} /> {translate('Back to estimates')}
      </Link>
      <PageHeader
        eyebrow={translate('Sales')}
        title={row.number ?? translate('Draft estimate')}
        description={translate('Created {{value0}}', {
          value0: new Date(row.createdAt).toLocaleDateString(uiLocale()),
        })}
        actions={
          <div className="flex flex-wrap gap-2">
            <EstimateRevisionAction estimate={row} />
            {row.status === 'draft' && (
              <Can permission="estimates.update">
                <Link
                  href={`/estimates/${row.id}/edit`}
                  className={buttonVariants({ variant: 'outline' })}
                >
                  <Pencil size={16} /> {translate('Edit')}
                </Link>
              </Can>
            )}
            {row.status === 'draft' && (
              <Can permission="estimates.update">
                {row.revisionOfId ? (
                  <ConfirmAction
                    label={t('issueEstimate')}
                    description={t('issueRevisionDescription')}
                    icon={<Send />}
                    disabled={busy}
                    onConfirm={async () => {
                      await actions.issue(row.id, row.version)
                      await refreshEstimates(cache)
                    }}
                  />
                ) : (
                  <Button
                    disabled={busy}
                    onClick={() => void act(() => actions.issue(row.id, row.version))}
                  >
                    <Send size={16} /> {t('issueEstimate')}
                  </Button>
                )}
              </Can>
            )}
            {['issued', 'sent'].includes(row.status) && (
              <Can permission="estimates.update">
                <Button
                  disabled={busy}
                  onClick={() => void act(() => actions.accept(row.id, row.version))}
                >
                  {t('markAccepted')}
                </Button>
              </Can>
            )}
            {row.status === 'accepted' && (
              <Can permission="invoices.create">
                <Link href={`/estimates/${row.id}/convert`} className={buttonVariants({})}>
                  {translate('Create invoice')}
                </Link>
              </Can>
            )}
            {row.status !== 'draft' && (
              <Button
                variant="outline"

                disabled={busy}
                onClick={() => void download()}
              >
                <Download size={16} />
                {artifacts.data?.length ? t('downloadPdf') : t('preparePdf')}
              </Button>
            )}
            {row.status !== 'draft' && (
              <Can permission="estimates.update">
                <RegeneratePdfDialog documentType="estimate" id={row.id} disabled={busy} />
              </Can>
            )}
            {['issued', 'sent'].includes(row.status) && (
              <Can permission={['estimates.read', 'estimates.update']}>
                <SendDocumentDialog
                  documentType="estimate"
                  id={row.id}
                  clientId={row.clientId}
                  version={row.version}
                />
              </Can>
            )}
            <MoreActions>
              {row.status === 'draft' && (
                <Can permission="estimates.delete">
                  <ConfirmAction
                    label={t('deleteDraft')}
                    description={t('deleteDraftWarning')}
                    icon={<Trash2 size={16} />}
                    variant="destructive"
                    disabled={busy}
                    onConfirm={async () => {
                      await actions.delete(row.id, row.version)
                      await refreshEstimates(cache)
                      navigate('/estimates')
                    }}
                  />
                </Can>
              )}
              {['issued', 'sent'].includes(row.status) && (
                <Can permission="estimates.update">
                  <MoreAction
                    label={t('markRejected')}
                    disabled={busy}
                    onSelect={() => void act(() => actions.reject(row.id, row.version))}
                  />
                </Can>
              )}
              {!['draft', 'cancelled', 'superseded'].includes(row.status) && (
                <Can permission="estimates.update">
                  <CancellationDialog
                    triggerLabel={t('cancelEstimate')}
                    title={t('cancelEstimate')}
                    description={t('cancelEstimateWarning')}
                    disabled={busy}
                    maxLength={1000}
                    validateReason={(reason) =>
                      EstimateCancellationSchema.shape.reason.safeParse(reason).success
                    }
                    onConfirm={async (reason) => {
                      await actions.cancel(row.id, row.version, reason)
                      await refreshEstimates(cache)
                    }}
                  />
                </Can>
              )}
            </MoreActions>
          </div>
        }
      />
      <FormError error={error} />
      {(row.revisionOfId || row.revisionId) && (
        <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-4 text-sm">
          <span>
            {t(
              row.status === 'superseded'
                ? 'supersededNotice'
                : row.status === 'draft'
                  ? 'draftRevisionNotice'
                  : 'revisionHistory',
            )}
          </span>
          {row.revisionOfId && (
            <Link
              href={`/estimates/${row.revisionOfId}`}
              className="text-primary-foreground underline"
            >
              {t('previousEstimate')}
            </Link>
          )}
          {row.revisionId && (
            <Link
              href={`/estimates/${row.revisionId}`}
              className="text-primary-foreground underline"
            >
              {t('viewRevision')}
            </Link>
          )}
        </section>
      )}
      <div className="grid gap-section lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <div className="grid content-start gap-section">
          <section className="rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{translate('Products')}</h2>
              <StatusBadge
                label={t(row.status)}
                tone={
                  row.status === 'draft'
                    ? 'draft'
                    : ['cancelled', 'rejected', 'superseded'].includes(row.status)
                      ? 'archived'
                      : 'active'
                }
              />
            </div>
            <div className="mt-5 overflow-x-auto">
              <table data-slot="data-table" className="w-full min-w-[500px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                    <th className="py-3">{translate('Product')}</th>
                    <th className="py-3">{translate('Qty')}</th>
                    <th className="py-3">{translate('Price')}</th>
                    <th className="py-3">{translate('VAT')}</th>
                    <th className="py-3 text-right">{translate('Total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {row.lines.map((line) => (
                    <tr key={line.id} className="border-b border-[var(--border)]">
                      <td className="py-3 font-medium">
                        {line.productName}
                        {line.packageWeightG ? (
                          <span className="ml-2 text-xs text-[var(--muted)]">
                            {line.packageWeightG} {translate('g')}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-3">{line.quantity}</td>
                      <td className="py-3">{line.unitPrice}</td>
                      <td className="py-3">
                        {line.vatRate === null ? translate('Off') : `${line.vatRate}%`}
                      </td>
                      <td className="py-3 text-right">{line.totalAmount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-5 grid justify-end gap-1 text-right text-sm">
              <p>
                {translate('Subtotal:')} {row.subtotal} {row.currency}
              </p>
              {Number(row.taxTotal) > 0 && (
                <p>
                  {translate('VAT:')} {row.taxTotal} {row.currency}
                </p>
              )}
              <strong className="text-lg">
                {translate('Total:')} {row.total} {row.currency}
              </strong>
            </div>
          </section>
          {linked.data?.length ? (
            <Can permission="invoices.read">
              <section className="grid gap-3 rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
                <h2 className="text-lg font-bold">{translate('Linked invoices')}</h2>
                {linked.data.map((invoice) => (
                  <Link
                    key={invoice.id}
                    href={`/invoices/${invoice.id}`}
                    className="text-sm text-[var(--accent)]"
                  >
                    {invoice.number ?? translate('Draft invoice')} · {invoice.status}
                  </Link>
                ))}
              </section>
            </Can>
          ) : null}
        </div>
        <div className="grid content-start gap-section">
          <section className="grid gap-3 rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
            <h2 className="text-lg font-bold">{translate('Details')}</h2>
            <p className="text-sm">
              <span className="text-[var(--muted)]">{translate('Client')}</span>
              <br />
              <Can permission="clients.read" fallback={<span>{row.clientDisplayName}</span>}>
                <Link href={`/clients/${row.clientId}`} className="text-[var(--accent)]">
                  {row.clientDisplayName}
                </Link>
              </Can>
            </p>
            <p className="text-sm">
              <span className="text-[var(--muted)]">{translate('Issue date')}</span>
              <br />
              {row.issueDate}
            </p>
            <p className="text-sm">
              <span className="text-[var(--muted)]">{translate('Valid until')}</span>
              <br />
              {row.validUntil ?? translate('Not set')}
            </p>
            <p className="text-sm">
              <span className="text-[var(--muted)]">{translate('Payment terms')}</span>
              <br />
              {row.paymentTerms ?? '—'}
            </p>
            <p className="text-sm">
              <span className="text-[var(--muted)]">{translate('Notes')}</span>
              <br />
              {row.notes ?? '—'}
            </p>
            {row.status !== 'draft' && (
              <p className="text-xs text-[var(--muted)]">
                {artifacts.data?.length
                  ? translate('Finalized PDF ready')
                  : 'PDF preparation in progress'}
              </p>
            )}
          </section>
        </div>
      </div>
      <Can permission={['estimates.read', 'notification_dispatches.read']}>
        <DocumentNotificationHistory documentType="estimate" id={row.id} />
      </Can>
    </div>
  )
}
