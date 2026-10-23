import { useTranslation } from 'react-i18next'
import { Link } from 'wouter'

import type { Invoice } from '../../../../api/generated/models'
import { displayDate } from '../../../../lib/dates'
import { useUiLanguage } from '../../../../lib/i18n'
import { Can } from '../../../identity'
import { DocumentClientLink } from '../../components/document-client-link'
import { DocumentTemplateSummary } from '../../components/document-template-summary'

export function InvoiceRelationships({
  invoice,
  clientName,
}: {
  invoice: Invoice
  clientName: string
}) {
  useUiLanguage()

  const { t } = useTranslation('sales')
  return (
    <section className="grid gap-3 rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
      <h2 className="text-lg font-bold">{t('details')}</h2>
      <DocumentTemplateSummary templateId={invoice.templateId} />
      <div className="text-sm">
        <span className="text-[var(--muted)]">{t('client')}</span>
        <br />
        <Can permission="clients.read" fallback={<span>{clientName}</span>}>
          <DocumentClientLink clientId={invoice.clientId} className="text-[var(--accent)]">
            {clientName}
          </DocumentClientLink>
        </Can>
      </div>
      <div className="text-sm">
        <span className="text-[var(--muted)]">{t('issueDate')}</span>
        <br />
        {displayDate(invoice.issueDate)}
      </div>
      <div className="text-sm">
        <span className="text-[var(--muted)]">{t('dueDate')}</span>
        <br />
        {invoice.dueDate ? displayDate(invoice.dueDate) : t('notSet')}
      </div>
      {(invoice.sourceEstimateId || invoice.sourceEstimateNumber) && (
        <Can permission="estimates.read">
          <div className="grid gap-1 text-sm">
            <span className="text-[var(--muted)]">{t('sourceEstimate')}</span>
            {invoice.sourceEstimateId ? (
              <Link
                href={`/estimates/${invoice.sourceEstimateId}`}
                className="text-[var(--accent)]"
              >
                {invoice.sourceEstimateNumber ?? t('estimate')}
              </Link>
            ) : (
              <span>{invoice.sourceEstimateNumber}</span>
            )}
          </div>
        </Can>
      )}
      {invoice.deliveryNotes.length > 0 && (
        <Can permission="delivery_notes.read">
          <div className="grid gap-1 text-sm">
            <span className="text-[var(--muted)]">{t('relatedDeliveryNotes')}</span>
            {invoice.deliveryNotes.map((note) => (
              <Link
                key={note.id}
                href={`/delivery-notes/${note.id}`}
                className="text-[var(--accent)]"
              >
                {note.number ?? t('draftDelivery')}
              </Link>
            ))}
          </div>
        </Can>
      )}
      {invoice.paymentTerms && (
        <div className="text-sm">
          <span className="text-[var(--muted)]">{t('paymentTerms')}</span>
          <br />
          {invoice.paymentTerms}
        </div>
      )}
      {invoice.notes && (
        <div className="text-sm">
          <span className="text-[var(--muted)]">{t('notes')}</span>
          <br />
          {invoice.notes}
        </div>
      )}
    </section>
  )
}
