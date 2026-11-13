import '../translations'

import { useTranslation } from 'react-i18next'

import type { InvoiceCreditableLine } from '../../../../../api/generated/models'
import { Checkbox } from '../../../../../components/ui/checkbox'
import { Input } from '../../../../../components/ui/input'
import { useUiLanguage } from '../../../../../lib/i18n'
import { displayNumber } from '../../../../../lib/number-format'
import { toCents } from './credit-amounts'
import {
  type CreditLineDraft,
  type CreditLineDrafts,
  draftIssue,
  emptyDraft,
} from './credit-line-drafts'

export function CreditLinesEditor({
  lines,
  currency,
  drafts,
  onChange,
}: {
  lines: InvoiceCreditableLine[]
  currency: string
  drafts: CreditLineDrafts
  onChange: (invoiceLineId: string, draft: CreditLineDraft) => void
}) {
  useUiLanguage()

  const { t } = useTranslation('creditNotes')
  return (
    <section className="rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
      <h2 className="text-lg font-bold">{t('creditableLines')}</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">{t('creditableLinesHint')}</p>
      <ul className="mt-4 grid gap-3">
        {lines.map((line) => {
          const draft = drafts[line.invoiceLineId] ?? emptyDraft
          const exhausted = line.remainingQuantity === 0 && toCents(line.remainingNetAmount) === 0
          const issue = draft.selected && draft.value !== '' ? draftIssue(line, draft) : null
          const set = (patch: Partial<CreditLineDraft>) =>
            onChange(line.invoiceLineId, { ...draft, ...patch })
          return (
            <li
              key={line.invoiceLineId}
              className="grid gap-3 rounded-xl border border-[var(--border)] p-3"
            >
              <label className="flex items-start gap-3">
                <Checkbox
                  checked={draft.selected}
                  disabled={exhausted}
                  aria-label={t('selectLine', { name: line.productName })}
                  onCheckedChange={(checked) => set({ selected: checked === true })}
                />
                <span className="grid gap-1 text-sm">
                  <strong>{line.productName}</strong>
                  <span className="text-[var(--muted)]">
                    {t('remaining', {
                      quantity: displayNumber(line.remainingQuantity),
                      amount: displayNumber(line.remainingNetAmount),
                      currency,
                    })}
                  </span>
                </span>
              </label>
              {draft.selected && (
                <div className="flex flex-wrap items-center gap-3 pl-7">
                  <fieldset className="flex gap-4 text-sm">
                    <legend className="sr-only">
                      {t('creditMode', { name: line.productName })}
                    </legend>
                    {(['quantity', 'amount'] as const).map((mode) => (
                      <label key={mode} className="inline-flex items-center gap-2">
                        <input
                          type="radio"
                          name={`mode-${line.invoiceLineId}`}
                          checked={draft.mode === mode}
                          onChange={() => set({ mode, value: '' })}
                        />
                        {mode === 'quantity' ? t('modeQuantity') : t('modeAmount')}
                      </label>
                    ))}
                  </fieldset>
                  <Input
                    className="max-w-40"
                    type="number"
                    inputMode={draft.mode === 'quantity' ? 'numeric' : 'decimal'}
                    min={draft.mode === 'quantity' ? 1 : 0.01}
                    step={draft.mode === 'quantity' ? 1 : 0.01}
                    aria-label={
                      draft.mode === 'quantity'
                        ? t('quantityToCredit', { name: line.productName })
                        : t('amountToCredit', { name: line.productName })
                    }
                    aria-invalid={issue ? true : undefined}
                    value={draft.value}
                    onChange={(event) => set({ value: event.target.value })}
                  />
                  {issue && (
                    <p role="alert" className="text-sm text-[var(--error-text)]">
                      {t(issue.key, { max: displayNumber(issue.max) })}
                    </p>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
