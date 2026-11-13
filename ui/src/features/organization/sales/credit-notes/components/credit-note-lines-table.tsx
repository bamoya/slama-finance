import '../translations'

import { useTranslation } from 'react-i18next'

import type { CreditNote } from '../../../../../api/generated/models'
import { useUiLanguage } from '../../../../../lib/i18n'
import { displayNumber } from '../../../../../lib/number-format'

/** Read-only lines and HT / VAT / TTC totals of a credit note, as computed by the server. */
export function CreditNoteLinesTable({ note }: { note: CreditNote }) {
  useUiLanguage()

  const { t } = useTranslation('creditNotes')
  return (
    <section className="rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
      <h2 className="text-lg font-bold">{t('lines')}</h2>
      <div className="mt-5 overflow-x-auto">
        <table data-slot="data-table" className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-[var(--muted)]">
              <th className="py-3">{t('product')}</th>
              <th className="py-3">{t('quantity')}</th>
              <th className="py-3">{t('unitPrice')}</th>
              <th className="py-3">{t('vat')}</th>
              <th className="py-3 text-right">{t('netAmount')}</th>
              <th className="py-3 text-right">{t('totalAmount')}</th>
            </tr>
          </thead>
          <tbody>
            {note.lines.map((line) => (
              <tr key={line.id} className="border-b border-[var(--border)]">
                <td className="py-3 font-medium">{line.productName}</td>
                <td className="py-3">{line.quantity > 0 ? displayNumber(line.quantity) : '—'}</td>
                <td className="py-3">{displayNumber(line.unitPrice)}</td>
                <td className="py-3">
                  {line.vatRate === null ? '—' : `${displayNumber(line.vatRate)}%`}
                </td>
                <td className="py-3 text-right">{displayNumber(line.netAmount)}</td>
                <td className="py-3 text-right">{displayNumber(line.totalAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="mt-5 grid justify-end gap-1 text-right text-sm">
        <div>
          <dt className="inline">{t('subtotal')}: </dt>
          <dd className="inline">
            {displayNumber(note.subtotal)} {note.currency}
          </dd>
        </div>
        <div>
          <dt className="inline">{t('taxTotal')}: </dt>
          <dd className="inline">
            {displayNumber(note.taxTotal)} {note.currency}
          </dd>
        </div>
        <div className="text-lg font-bold">
          <dt className="inline">{t('total')}: </dt>
          <dd className="inline">
            {displayNumber(note.total)} {note.currency}
          </dd>
        </div>
      </dl>
    </section>
  )
}
