import '../translations'

import { useTranslation } from 'react-i18next'
import { Link } from 'wouter'

import { StatusBadge } from '../../../../../components/management/status-badge'
import { useUiLanguage } from '../../../../../lib/i18n'
import { displayNumber } from '../../../../../lib/number-format'
import { Can } from '../../../identity'
import { useInvoiceCreditNotes } from '../queries'
import { CreditNoteKindBadge } from './credit-note-kind-badge'

/** Credit notes of one invoice (drafts and issued), shown only with credit_notes.read. */
export function InvoiceCreditNotes({ invoiceId }: { invoiceId: string }) {
  return (
    <Can permission="credit_notes.read">
      <InvoiceCreditNotesList invoiceId={invoiceId} />
    </Can>
  )
}

function InvoiceCreditNotesList({ invoiceId }: { invoiceId: string }) {
  useUiLanguage()

  const { t } = useTranslation('creditNotes')
  const query = useInvoiceCreditNotes(invoiceId)
  return (
    <section className="rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
      <h2 className="text-lg font-bold">{t('creditNotesOfInvoice')}</h2>
      {query.data?.length === 0 && (
        <p className="mt-3 text-sm text-[var(--muted)]">{t('noCreditNotesOfInvoice')}</p>
      )}
      <ul className="mt-3 grid gap-2">
        {query.data?.map((note) => (
          <li key={note.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="inline-flex flex-wrap items-center gap-2">
              <Link
                href={`/credit-notes/${note.id}`}
                aria-label={`${t('viewCreditNote')} ${note.number ?? t('draftCreditNote')}`}
                className="font-semibold hover:text-[var(--accent)]"
              >
                {note.number ?? t('draftCreditNote')}
              </Link>
              <StatusBadge
                label={t(note.status)}
                tone={note.status === 'draft' ? 'draft' : 'active'}
              />
              <CreditNoteKindBadge kind={note.kind} />
            </span>
            <strong>
              {displayNumber(note.total)} {note.currency}
            </strong>
          </li>
        ))}
      </ul>
    </section>
  )
}
