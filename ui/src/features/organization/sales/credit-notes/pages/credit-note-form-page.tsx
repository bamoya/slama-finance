import '../translations'

import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Save, Send } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Redirect, useLocation, useParams, useSearchParams } from 'wouter'

import type { CreditNote, InvoiceCreditableLines } from '../../../../../api/generated/models'
import {
  type CreditNoteInput,
  CreditNoteInputSchema,
  CreditNoteUpdateSchema,
} from '../../../../../api/generated/schemas/sales/credit-notes.schemas'
import { FormActionBar } from '../../../../../components/management/form-action-bar'
import { PageHeader } from '../../../../../components/management/page-header'
import { RequestState } from '../../../../../components/management/request-state'
import { Button } from '../../../../../components/ui/button'
import { Textarea } from '../../../../../components/ui/textarea'
import { useUiLanguage } from '../../../../../lib/i18n'
import { displayNumber } from '../../../../../lib/number-format'
import { type CreditLineDrafts, creditPreview, draftIssue } from '../components/credit-line-drafts'
import { CreditLinesEditor } from '../components/credit-lines-editor'
import { CreditNoteError } from '../components/credit-note-error'
import {
  refreshCreditNotes,
  useCreditNote,
  useCreditNoteActions,
  useInvoiceCreditableLines,
} from '../queries'

export function CreditNoteFormPage() {
  useUiLanguage()

  const { creditNoteId } = useParams<{ creditNoteId?: string }>()
  const [params] = useSearchParams()
  const note = useCreditNote(creditNoteId ?? '', Boolean(creditNoteId))
  const invoiceId = creditNoteId ? note.data?.invoiceId : (params.get('invoiceId') ?? '')
  const creditable = useInvoiceCreditableLines(invoiceId ?? '', Boolean(invoiceId))
  if (creditNoteId && note.data && note.data.status !== 'draft')
    return <Redirect to={`/credit-notes/${creditNoteId}`} />
  const pending = [creditNoteId ? note : undefined, invoiceId ? creditable : undefined].find(
    (query) => query && (query.isPending || query.isError),
  )
  if (pending || !creditable.data)
    return (
      <div className="mx-auto max-w-[1500px] p-page">
        {pending ? <RequestState query={pending} /> : <MissingInvoice />}
      </div>
    )
  return (
    <CreditNoteEditor
      key={creditNoteId ?? 'new'}
      note={creditNoteId ? note.data! : null}
      creditable={creditable.data}
    />
  )
}

function MissingInvoice() {
  const { t } = useTranslation('creditNotes')
  return (
    <p role="alert" className="text-sm">
      {t('invoiceNotCreditable')}
    </p>
  )
}

const initialDrafts = (note: CreditNote | null): CreditLineDrafts =>
  Object.fromEntries(
    (note?.lines ?? []).map((line) => [
      line.invoiceLineId,
      line.quantity > 0
        ? { selected: true, mode: 'quantity' as const, value: String(line.quantity) }
        : { selected: true, mode: 'amount' as const, value: line.netAmount },
    ]),
  )

function CreditNoteEditor({
  note,
  creditable,
}: {
  note: CreditNote | null
  creditable: InvoiceCreditableLines
}) {
  useUiLanguage()

  const { t } = useTranslation('creditNotes')
  const [, navigate] = useLocation()
  const cache = useQueryClient()
  const actions = useCreditNoteActions()
  const [drafts, setDrafts] = useState<CreditLineDrafts>(() => initialDrafts(note))
  const [reason, setReason] = useState(note?.reason ?? '')
  const [error, setError] = useState<unknown>()
  const [issues, setIssues] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  // A draft saved by a failed "Save and issue" is updated, not created again.
  const [saved, setSaved] = useState<{ id: string; version: number } | null>(
    note ? { id: note.id, version: note.version } : null,
  )
  const blocked = !creditable.creditable && !note
  const preview = creditPreview(creditable.lines, drafts)
  const submit = async (issue: boolean) => {
    setError(undefined)
    const selected = creditable.lines.filter((line) => drafts[line.invoiceLineId]?.selected)
    const problems: string[] = []
    if (!selected.length) problems.push(t('selectAtLeastOne'))
    if (!reason.trim()) problems.push(t('reasonRequired'))
    if (selected.some((line) => draftIssue(line, drafts[line.invoiceLineId]!)))
      problems.push(t('errorInvalidLine'))
    setIssues(problems)
    if (problems.length) return
    const lines: CreditNoteInput['lines'] = selected.map((line) => {
      const draft = drafts[line.invoiceLineId]!
      return draft.mode === 'quantity'
        ? { invoiceLineId: line.invoiceLineId, quantity: Number(draft.value) }
        : { invoiceLineId: line.invoiceLineId, amount: draft.value }
    })
    setBusy(true)
    try {
      let target = saved
      if (!target) {
        const created = await actions.create(
          CreditNoteInputSchema.parse({
            invoiceId: creditable.invoiceId,
            reason: reason.trim(),
            lines,
          }),
        )
        target = { id: created.id, version: created.version }
        setSaved(target)
      } else {
        const updated = await actions.update(
          target.id,
          CreditNoteUpdateSchema.parse({
            expectedVersion: target.version,
            reason: reason.trim(),
            lines,
          }),
        )
        target = { id: updated.id, version: updated.version }
        setSaved(target)
      }
      if (issue) await actions.issue(target.id, target.version)
      await refreshCreditNotes(cache)
      navigate(`/credit-notes/${target.id}`)
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <Link
        href={note ? `/credit-notes/${note.id}` : `/invoices/${creditable.invoiceId}`}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--muted)]"
      >
        <ArrowLeft size={16} />{' '}
        {note ? t('backToCreditNotes') : t('correctsInvoice', { number: creditable.invoiceNumber })}
      </Link>
      <PageHeader
        eyebrow={t('creditNotes')}
        title={note ? t('editCreditNote') : t('newCreditNote')}
        description={t('correctsInvoice', { number: creditable.invoiceNumber })}
      />
      <CreditNoteError error={error} />
      {issues.length > 0 && (
        <ul
          role="alert"
          className="list-disc rounded-xl border border-[var(--error-border)] bg-[var(--error-bg)] p-3 pl-8 text-sm text-[var(--error-text)]"
        >
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
      {!creditable.creditable && !note && (
        <p role="alert" className="text-sm text-[var(--error-text)]">
          {t('invoiceNotCreditable')}
        </p>
      )}
      <form
        id="credit-note-form"
        className="grid gap-section lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]"
        onSubmit={(event) => {
          event.preventDefault()
          void submit(false)
        }}
      >
        <CreditLinesEditor
          lines={creditable.lines}
          currency={creditable.currency}
          drafts={drafts}
          onChange={(id, draft) => setDrafts((current) => ({ ...current, [id]: draft }))}
        />
        <div className="grid content-start gap-section">
          <section className="grid gap-2 rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
            <label htmlFor="credit-note-reason" className="text-lg font-bold">
              {t('reason')}
            </label>
            <p className="text-sm text-[var(--muted)]">{t('reasonHint')}</p>
            <Textarea
              id="credit-note-reason"
              aria-required
              maxLength={1000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </section>
          <section className="rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel text-sm">
            <h2 className="text-lg font-bold">{t('previewTitle')}</h2>
            <p className="text-[var(--muted)]">{t('previewNote')}</p>
            <dl className="mt-3 grid gap-1">
              <div className="flex justify-between">
                <dt>{t('subtotal')}</dt>
                <dd data-testid="preview-net">
                  {displayNumber(preview.net)} {creditable.currency}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>{t('taxTotal')}</dt>
                <dd data-testid="preview-tax">
                  {displayNumber(preview.tax)} {creditable.currency}
                </dd>
              </div>
              <div className="flex justify-between text-base font-bold">
                <dt>{t('total')}</dt>
                <dd data-testid="preview-total">
                  {displayNumber(preview.total)} {creditable.currency}
                </dd>
              </div>
            </dl>
          </section>
        </div>
        <FormActionBar>
          <Button type="submit" variant="outline" disabled={busy || blocked}>
            <Save size={16} /> {busy ? t('saving') : t('saveDraft')}
          </Button>
          <Button type="button" disabled={busy || blocked} onClick={() => void submit(true)}>
            <Send size={16} /> {t('saveAndIssue')}
          </Button>
        </FormActionBar>
      </form>
    </div>
  )
}
