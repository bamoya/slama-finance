import '../../credit-notes/translations'

import { useTranslation } from 'react-i18next'

import type { Invoice } from '../../../../../api/generated/models'
import { StatusBadge } from '../../../../../components/management/status-badge'
import { useUiLanguage } from '../../../../../lib/i18n'
import { displayNumber } from '../../../../../lib/number-format'

export function InvoiceBalance({ invoice }: { invoice: Invoice }) {
  useUiLanguage()

  const { t } = useTranslation('sales')
  const { t: tc } = useTranslation('creditNotes')
  const credited = Number(invoice.creditedAmount) > 0
  const refundDue = Number(invoice.refundDueAmount) > 0
  const money = (value: string) => `${displayNumber(value)} ${invoice.currency}`
  return (
    <section className="grid gap-4 rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">{t('invoiceBalance')}</h2>
        <StatusBadge
          label={t(invoice.paymentStatus)}
          tone={invoice.paymentStatus === 'unpaid' ? 'draft' : 'active'}
        />
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[var(--muted)]">{t('total')}</dt>
          <dd className="font-semibold">{money(invoice.total)}</dd>
        </div>
        {credited && (
          <div>
            <dt className="text-[var(--muted)]">{tc('creditedAmount')}</dt>
            <dd className="font-semibold">{money(invoice.creditedAmount)}</dd>
          </div>
        )}
        {credited && (
          <div>
            <dt className="text-[var(--muted)]">{tc('invoiceNetAmount')}</dt>
            <dd className="font-semibold">{money(invoice.netAmount)}</dd>
          </div>
        )}
        <div>
          <dt className="text-[var(--muted)]">{t('paidAmount')}</dt>
          <dd className="font-semibold">{money(invoice.paidAmount)}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">{t('pendingAmount')}</dt>
          <dd className="font-semibold">{money(invoice.pendingAmount)}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">
            {credited ? tc('netDue') : t('outstandingAmount')}
          </dt>
          <dd className="font-semibold">{money(invoice.outstandingAmount)}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">{t('availableBalance')}</dt>
          <dd className="font-semibold">{money(invoice.availableBalance)}</dd>
        </div>
      </dl>
      {refundDue && (
        <div
          role="status"
          className="rounded-xl border border-[var(--error-border)] bg-[var(--error-bg)] p-3 text-sm text-[var(--error-text)]"
        >
          <p className="font-bold">
            {tc('refundDue')}: {money(invoice.refundDueAmount)}
          </p>
          <p className="mt-1">{tc('refundDueHint')}</p>
        </div>
      )}
    </section>
  )
}
