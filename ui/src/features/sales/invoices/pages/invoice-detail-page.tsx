import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Download, Pencil, Plus, Send, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useParams } from 'wouter'

import { InvoiceCancellationSchema } from '../../../../api/generated/schemas/sales/invoices.schemas'
import { CancellationDialog } from '../../../../components/management/cancellation-dialog'
import { ConfirmAction } from '../../../../components/management/confirm-action'
import { FormError } from '../../../../components/management/form-error'
import { MoreActions } from '../../../../components/management/more-actions'
import { PageHeader } from '../../../../components/management/page-header'
import { RequestState } from '../../../../components/management/request-state'
import { StatusBadge } from '../../../../components/management/status-badge'
import { Button, buttonVariants } from '../../../../components/ui/button'
import { uiLocale } from '../../../../lib/i18n'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { Can } from '../../../identity'
import { RegeneratePdfDialog } from '../../components/regenerate-pdf-dialog'
import { DocumentNotificationHistory } from '../../notifications/components/document-notification-history'
import { SendDocumentDialog } from '../../notifications/components/send-document-dialog'
import { InvoiceBalance } from '../../payments/components/invoice-balance'
import { InvoicePaymentHistory } from '../components/invoice-payment-history'
import { InvoiceRelationships } from '../components/invoice-relationships'
import { refreshInvoices, useInvoice, useInvoiceActions, useInvoiceArtifacts } from '../queries'

export function InvoiceDetailPage() {
  useUiLanguage()

  const { t } = useTranslation('sales')
  const { documentId = '' } = useParams<{ documentId: string }>()
  const [, navigate] = useLocation()
  const cache = useQueryClient()
  const invoice = useInvoice(documentId)
  const artifacts = useInvoiceArtifacts(
    documentId,
    Boolean(invoice.data && invoice.data.status !== 'draft'),
  )
  const actions = useInvoiceActions()
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  if (invoice.isPending || invoice.isError)
    return (
      <div className="mx-auto max-w-[1500px] p-page">
        <RequestState query={invoice} />
      </div>
    )
  const row = invoice.data
  const act = async (action: () => Promise<unknown>, after?: () => void) => {
    setBusy(true)
    setError(undefined)
    try {
      await action()
      await refreshInvoices(cache)
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
      link.download = `${row.number ?? 'invoice'}.pdf`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    })
  }
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <Link
        href="/invoices"
        className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--muted)]"
      >
        <ArrowLeft size={16} /> {translate('Back to invoices')}
      </Link>
      <PageHeader
        eyebrow={translate('Sales')}
        title={row.number ?? translate('Draft invoice')}
        description={translate('Created {{value0}}', {
          value0: new Date(row.createdAt).toLocaleDateString(uiLocale()),
        })}
        actions={
          <div className="flex flex-wrap gap-2">
            {row.status === 'draft' && row.deliveryNoteIds.length === 0 && (
              <Can permission="invoices.update">
                <Link
                  href={`/invoices/${row.id}/edit`}
                  className={buttonVariants({ variant: 'outline' })}
                >
                  <Pencil size={16} /> {translate('Edit')}
                </Link>
              </Can>
            )}
            {row.status === 'draft' && (
              <Can permission="invoices.update">
                <Button
                  disabled={busy}
                  onClick={() => void act(() => actions.issue(row.id, row.version))}
                >
                  <Send size={16} /> {t('issueInvoice')}
                </Button>
              </Can>
            )}
            {['issued', 'sent'].includes(row.status) && Number(row.availableBalance) > 0 && (
              <Can permission={['payments.create', 'invoices.read']}>
                <Link
                  href={`/payments/new?invoiceId=${row.id}&clientId=${row.clientId}`}
                  className={buttonVariants({})}
                >
                  <Plus size={16} /> {t('recordPayment')}
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
              <Can permission="invoices.update">
                <RegeneratePdfDialog documentType="invoice" id={row.id} disabled={busy} />
              </Can>
            )}
            {['issued', 'sent'].includes(row.status) && (
              <Can permission={['invoices.read', 'invoices.update']}>
                <SendDocumentDialog
                  documentType="invoice"
                  id={row.id}
                  clientId={row.clientId}
                  version={row.version}
                />
              </Can>
            )}
            <MoreActions>
              {row.status === 'draft' && (
                <Can permission="invoices.delete">
                  <ConfirmAction
                    label={t('deleteDraft')}
                    description={t('deleteDraftWarning')}
                    icon={<Trash2 size={16} />}
                    variant="destructive"
                    disabled={busy}
                    onConfirm={async () => {
                      await actions.delete(row.id, row.version)
                      await refreshInvoices(cache)
                      navigate('/invoices')
                    }}
                  />
                </Can>
              )}
              {['issued', 'sent'].includes(row.status) && (
                <Can permission="invoices.update">
                  <CancellationDialog
                    triggerLabel={t('cancelInvoice')}
                    title={t('cancelInvoice')}
                    description={t('cancelInvoiceWarning')}
                    disabled={busy}
                    maxLength={1000}
                    validateReason={(reason) =>
                      InvoiceCancellationSchema.shape.reason.safeParse(reason).success
                    }
                    onConfirm={async (reason) => {
                      await actions.cancel(row.id, row.version, reason)
                      await refreshInvoices(cache)
                    }}
                  />
                </Can>
              )}
            </MoreActions>
          </div>
        }
      />
      <FormError error={error} />
      <div className="grid gap-section lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <div className="grid content-start gap-section">
          <section className="rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{translate('Products')}</h2>
              <StatusBadge
                label={row.status}
                tone={
                  row.status === 'draft'
                    ? 'draft'
                    : row.status === 'cancelled'
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
          <InvoicePaymentHistory invoice={row} />
        </div>
        <div className="grid content-start gap-section">
          <InvoiceBalance invoice={row} />
          <InvoiceRelationships invoice={row} clientName={row.clientDisplayName} />
        </div>
      </div>
      <Can permission={['invoices.read', 'notification_dispatches.read']}>
        <DocumentNotificationHistory documentType="invoice" id={row.id} />
      </Can>
    </div>
  )
}
