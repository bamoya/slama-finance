import '../translations'

import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Download, Pencil, Send, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useParams } from 'wouter'

import { ConfirmAction } from '../../../../../components/management/confirm-action'
import { PageHeader } from '../../../../../components/management/page-header'
import { RequestState } from '../../../../../components/management/request-state'
import { StatusBadge } from '../../../../../components/management/status-badge'
import { Button, buttonVariants } from '../../../../../components/ui/button'
import { displayDate, displayDateTime } from '../../../../../lib/dates'
import { useUiLanguage } from '../../../../../lib/i18n'
import { Can } from '../../../identity'
import { CreditNoteError } from '../components/credit-note-error'
import { CreditNoteKindBadge } from '../components/credit-note-kind-badge'
import { CreditNoteLinesTable } from '../components/credit-note-lines-table'
import {
  refreshCreditNotes,
  useCreditNote,
  useCreditNoteActions,
  useCreditNoteArtifacts,
} from '../queries'

export function CreditNoteDetailPage() {
  useUiLanguage()

  const { t } = useTranslation('creditNotes')
  const { creditNoteId = '' } = useParams<{ creditNoteId: string }>()
  const [, navigate] = useLocation()
  const cache = useQueryClient()
  const query = useCreditNote(creditNoteId)
  const artifacts = useCreditNoteArtifacts(
    creditNoteId,
    Boolean(query.data && query.data.status !== 'draft'),
  )
  const actions = useCreditNoteActions()
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  if (query.isPending || query.isError)
    return (
      <div className="mx-auto max-w-[1500px] p-page">
        <RequestState query={query} />
      </div>
    )
  const note = query.data
  const draft = note.status === 'draft'
  const act = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError(undefined)
    try {
      await action()
      await refreshCreditNotes(cache)
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
    }
  }
  const download = async () => {
    const file = artifacts.data?.at(-1)
    if (!file) return act(() => actions.preparePdf(note.id))
    return act(async () => {
      const blob = await actions.downloadPdf(file.id)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${note.number ?? 'credit-note'}.pdf`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    })
  }
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <Link
        href="/credit-notes"
        className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--muted)]"
      >
        <ArrowLeft size={16} /> {t('backToCreditNotes')}
      </Link>
      <PageHeader
        eyebrow={t('creditNotes')}
        title={note.number ?? t('draftCreditNote')}
        status={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge label={t(note.status)} tone={draft ? 'draft' : 'active'} />
            <CreditNoteKindBadge kind={note.kind} />
          </span>
        }
        description={t('createdOn', { value: displayDateTime(note.createdAt).split(' ')[0] })}
        actions={
          <div className="flex flex-wrap gap-2">
            {draft && (
              <Can permission="credit_notes.update">
                <Link
                  href={`/credit-notes/${note.id}/edit`}
                  className={buttonVariants({ variant: 'outline' })}
                >
                  <Pencil size={16} /> {t('edit')}
                </Link>
              </Can>
            )}
            {draft && (
              <Can permission="credit_notes.update">
                <ConfirmAction
                  label={t('issueCreditNote')}
                  description={t('issueCreditNoteWarning')}
                  disabled={busy}
                  icon={<Send size={16} />}
                  onConfirm={async () => {
                    await actions.issue(note.id, note.version)
                    await refreshCreditNotes(cache)
                  }}
                />
              </Can>
            )}
            {!draft && artifacts.data?.length ? (
              <Button variant="outline" disabled={busy} onClick={() => void download()}>
                <Download size={16} />
                {t('downloadPdf')}
              </Button>
            ) : !draft && artifacts.data ? (
              <Can permission="credit_notes.update">
                <Button variant="outline" disabled={busy} onClick={() => void download()}>
                  <Download size={16} /> {t('preparePdf')}
                </Button>
              </Can>
            ) : null}
            {draft && (
              <Can permission="credit_notes.delete">
                <ConfirmAction
                  label={t('deleteCreditNote')}
                  description={t('deleteCreditNoteWarning')}
                  variant="destructive"
                  disabled={busy}
                  icon={<Trash2 size={16} />}
                  onConfirm={async () => {
                    await actions.delete(note.id, note.version)
                    navigate('/credit-notes')
                    void refreshCreditNotes(cache)
                  }}
                />
              </Can>
            )}
          </div>
        }
      />
      <CreditNoteError error={error} />
      {note.kind === 'simple' && (
        <p
          role="note"
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--muted)]"
        >
          {t('simpleCreditNoteNotice')}
        </p>
      )}
      <div className="grid gap-section lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <div className="grid content-start gap-section">
          <CreditNoteLinesTable note={note} />
        </div>
        <div className="grid content-start gap-section">
          <section className="grid gap-3 rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel text-sm">
            <p>
              <Can
                permission="invoices.read"
                fallback={<strong>{t('correctsInvoice', { number: note.invoiceNumber })}</strong>}
              >
                <Link
                  href={`/invoices/${note.invoiceId}`}
                  className="font-semibold text-[var(--accent)]"
                >
                  {t('correctsInvoice', { number: note.invoiceNumber })}
                </Link>
              </Can>
            </p>
            <p className="text-[var(--muted)]">
              {t('client')}: {note.clientDisplayName}
            </p>
            {note.issueDate && (
              <p className="text-[var(--muted)]">
                {t('issueDate')}: {displayDate(note.issueDate)}
              </p>
            )}
            <div>
              <h2 className="text-[var(--muted)]">{t('reason')}</h2>
              <p className="mt-1 whitespace-pre-wrap font-medium">{note.reason}</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
