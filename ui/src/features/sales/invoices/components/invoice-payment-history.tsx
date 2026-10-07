import { useTranslation } from 'react-i18next'
import { Link } from 'wouter'

import type { Invoice } from '../../../../api/generated/models'
import { RequestState } from '../../../../components/management/request-state'
import { StatusBadge } from '../../../../components/management/status-badge'
import { useUiLanguage } from '../../../../lib/i18n'
import { useAuthorization } from '../../../identity'
import { usePayments } from '../../payments/queries'

export function InvoicePaymentHistory({ invoice }: { invoice: Invoice }) {
  useUiLanguage()

  const { t } = useTranslation('sales')
  const { can } = useAuthorization()
  const payments = usePayments({ invoiceId: invoice.id, limit: 100 }, can('payments.read'))
  if (!can('payments.read')) return null
  return (
    <section className="grid gap-4 rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
      <h2 className="text-lg font-bold">{t('paymentHistory')}</h2>
      {payments.isPending || payments.isError ? (
        <RequestState query={payments} />
      ) : payments.data.items.length ? (
        <div className="grid divide-y divide-[var(--border)]">
          {payments.data.items.map((payment) => (
            <div
              key={payment.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
            >
              <div className="grid gap-1">
                <Link
                  href={`/payments/${payment.id}`}
                  className="font-semibold text-[var(--accent)]"
                >
                  {payment.number}
                </Link>
                <span className="text-[var(--muted)]">
                  {payment.paymentDate} · {t(payment.method)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <strong>
                  {payment.amount} {payment.currency}
                </strong>
                <StatusBadge
                  label={t(payment.status)}
                  tone={
                    payment.status === 'cancelled'
                      ? 'archived'
                      : payment.status === 'pending'
                        ? 'draft'
                        : 'active'
                  }
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--muted)]">{t('noPaymentHistory')}</p>
      )}
    </section>
  )
}
