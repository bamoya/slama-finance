import { useTranslation } from 'react-i18next'

import type { Invoice } from '../../../../api/generated/models'
import { StatusBadge } from '../../../../components/management/status-badge'
import { useUiLanguage } from '../../../../lib/i18n'

export function InvoiceBalance({ invoice }: { invoice: Invoice }) {
  useUiLanguage()

  const { t } = useTranslation('sales')
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
          <dd className="font-semibold">
            {invoice.total} {invoice.currency}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">{t('paidAmount')}</dt>
          <dd className="font-semibold">
            {invoice.paidAmount} {invoice.currency}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">{t('pendingAmount')}</dt>
          <dd className="font-semibold">
            {invoice.pendingAmount} {invoice.currency}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">{t('outstandingAmount')}</dt>
          <dd className="font-semibold">
            {invoice.outstandingAmount} {invoice.currency}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">{t('availableBalance')}</dt>
          <dd className="font-semibold">
            {invoice.availableBalance} {invoice.currency}
          </dd>
        </div>
      </dl>
    </section>
  )
}
