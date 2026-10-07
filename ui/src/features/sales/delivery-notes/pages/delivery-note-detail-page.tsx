import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Download, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useParams } from 'wouter'

import { DeliveryNoteCancellationSchema } from '../../../../api/generated/schemas/sales/delivery-notes.schemas'
import { CancellationDialog } from '../../../../components/management/cancellation-dialog'
import { ConfirmAction } from '../../../../components/management/confirm-action'
import { FormError } from '../../../../components/management/form-error'
import { MoreActions } from '../../../../components/management/more-actions'
import { PageHeader } from '../../../../components/management/page-header'
import { RequestState } from '../../../../components/management/request-state'
import { StatusBadge } from '../../../../components/management/status-badge'
import { Button, buttonVariants } from '../../../../components/ui/button'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { Can } from '../../../identity'
import { RegeneratePdfDialog } from '../../components/regenerate-pdf-dialog'
import { DeliveryAcknowledgmentDialog } from '../components/delivery-acknowledgment-dialog'
import {
  refreshDeliveries,
  useDeliveryActions,
  useDeliveryArtifacts,
  useDeliveryNote,
} from '../queries'

export function DeliveryNoteDetailPage() {
  useUiLanguage()

  const { t } = useTranslation('sales')
  const { noteId = '' } = useParams<{ noteId: string }>()
  const [, navigate] = useLocation()
  const cache = useQueryClient()
  const note = useDeliveryNote(noteId)
  const artifacts = useDeliveryArtifacts(noteId, Boolean(note.data && note.data.status !== 'draft'))
  const actions = useDeliveryActions()
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  if (note.isPending || note.isError)
    return (
      <div className="mx-auto max-w-[1500px] p-page">
        <RequestState query={note} />
      </div>
    )
  const row = note.data
  const act = async (action: () => Promise<unknown>, after?: () => void) => {
    setBusy(true)
    setError(undefined)
    try {
      await action()
      await refreshDeliveries(cache)
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
      link.download = `${row.number ?? 'delivery-note'}.pdf`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    })
  }
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <Link
        href="/delivery-notes"
        className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--muted)]"
      >
        <ArrowLeft size={16} /> {translate('Back to delivery notes')}
      </Link>
      <PageHeader
        eyebrow={translate('Sales')}
        title={row.number ?? translate('Draft delivery note')}
        description={translate('Delivery planned for {{value0}}', { value0: row.deliveryDate })}
        actions={
          <div className="flex flex-wrap gap-2">
            {row.status === 'draft' && (
              <Can permission="delivery_notes.update">
                <Link
                  href={`/delivery-notes/${row.id}/edit`}
                  className={buttonVariants({ variant: 'outline' })}
                >
                  <Pencil size={16} /> {translate('Edit')}
                </Link>
              </Can>
            )}
            {row.status === 'draft' && (
              <Can permission="delivery_notes.update">
                <Button
                  disabled={busy}
                  onClick={() => void act(() => actions.prepare(row.id, row.version))}
                >
                  {t('prepareDeliveryNote')}
                </Button>
              </Can>
            )}
            {row.status === 'prepared' && (
              <Can permission="delivery_notes.update">
                <Button
                  disabled={busy}
                  onClick={() => void act(() => actions.deliver(row.id, row.version))}
                >
                  {t('markDelivered')}
                </Button>
              </Can>
            )}
            {row.status === 'delivered' && (
              <Can permission="delivery_notes.update">
                <DeliveryAcknowledgmentDialog
                  expectedVersion={row.version}
                  disabled={busy}
                  onConfirm={async (receiver) => {
                    await actions.acknowledge(row.id, row.version, receiver)
                    await refreshDeliveries(cache)
                  }}
                />
              </Can>
            )}
            {!row.invoiceId &&
              ['delivered', 'acknowledged'].includes(row.status) &&
              row.lines.some((line) => line.remainingBillableQuantity > 0) && (
                <Can permission="invoices.create">
                  <Link href={`/delivery-notes/${row.id}/convert`} className={buttonVariants({})}>
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
              <Can permission="delivery_notes.update">
                <RegeneratePdfDialog documentType="delivery_note" id={row.id} disabled={busy} />
              </Can>
            )}
            <MoreActions>
              {row.status === 'draft' && (
                <Can permission="delivery_notes.delete">
                  <ConfirmAction
                    label={t('deleteDraft')}
                    description={t('deleteDraftWarning')}
                    icon={<Trash2 size={16} />}
                    variant="destructive"
                    disabled={busy}
                    onConfirm={async () => {
                      await actions.delete(row.id, row.version)
                      await refreshDeliveries(cache)
                      navigate('/delivery-notes')
                    }}
                  />
                </Can>
              )}
              {['prepared', 'delivered'].includes(row.status) && (
                <Can permission="delivery_notes.update">
                  <CancellationDialog
                    triggerLabel={t('cancelDeliveryNote')}
                    title={t('cancelDeliveryNote')}
                    description={t('cancelDeliveryNoteWarning')}
                    disabled={busy}
                    maxLength={1000}
                    validateReason={(reason) =>
                      DeliveryNoteCancellationSchema.shape.reason.safeParse(reason).success
                    }
                    onConfirm={async (reason) => {
                      await actions.cancel(row.id, row.version, reason)
                      await refreshDeliveries(cache)
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
              <table data-slot="data-table" className="w-full min-w-[400px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                    <th className="py-3">{translate('Product')}</th>
                    <th className="py-3">{translate('Package')}</th>
                    <th className="py-3 text-right">{translate('Quantity')}</th>
                    <th className="py-3 text-right">{t('billedQuantity')}</th>
                    <th className="py-3 text-right">{t('billableQuantity')}</th>
                  </tr>
                </thead>
                <tbody>
                  {row.lines.map((line) => (
                    <tr key={line.id} className="border-b border-[var(--border)]">
                      <td className="py-3 font-medium">{line.productName}</td>
                      <td className="py-3">
                        {line.packageWeightG ? `${line.packageWeightG} g` : '—'}
                      </td>
                      <td className="py-3 text-right">{line.quantity}</td>
                      <td className="py-3 text-right">{line.billedQuantity}</td>
                      <td className="py-3 text-right">{line.remainingBillableQuantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
        <div className="grid content-start gap-section">
          <section className="grid gap-3 rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
            <h2 className="text-lg font-bold">{translate('Details')}</h2>
            <p className="text-sm">
              <span className="text-[var(--muted)]">{t('client')}</span>
              <br />
              <Can permission="clients.read" fallback={<span>{row.clientDisplayName}</span>}>
                <Link href={`/clients/${row.clientId}`} className="text-[var(--accent)]">
                  {row.clientDisplayName}
                </Link>
              </Can>
            </p>
            <p className="text-sm">
              <span className="text-[var(--muted)]">{translate('Delivery address')}</span>
              <br />
              {row.deliveryAddress}
            </p>
            <p className="text-sm">
              <span className="text-[var(--muted)]">{translate('Instructions')}</span>
              <br />
              {row.instructions ?? '—'}
            </p>
            <p className="text-sm">
              <span className="text-[var(--muted)]">{translate('Receiver')}</span>
              <br />
              {row.receivedByName ?? '—'}
            </p>
            {row.invoices.length > 0 && (
              <Can permission="invoices.read">
                <div className="grid gap-1 text-sm">
                  <span className="text-[var(--muted)]">{t('relatedInvoices')}</span>
                  {row.invoices.map((invoice) => (
                    <Link
                      key={invoice.id}
                      href={`/invoices/${invoice.id}`}
                      className="text-[var(--accent)]"
                    >
                      {invoice.number ?? t('draftInvoice')}
                    </Link>
                  ))}
                </div>
              </Can>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
