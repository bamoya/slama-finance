import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'wouter'

import { PageHeader } from '../../../components/management/page-header'
import { StatusBadge } from '../../../components/management/status-badge'
import { translate, useUiLanguage } from '../../../lib/i18n'
import { formatMoney } from '../../products'
import { payments } from '../data/payments'

export function PaymentDetailPage() {
  useUiLanguage()

  const { paymentId } = useParams<{ paymentId: string }>()
  const payment = payments.find((item) => item.id === paymentId)
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <Link
        href="/payments"
        className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--muted)]"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        {translate('Back to payments')}
      </Link>
      <PageHeader
        eyebrow={translate('Sales / Payments')}
        title={payment?.number ?? translate('Payment not found')}
        description={translate('Payment record preview — proof-of-concept data.')}
      />
      {payment && (
        <section className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-panel">
          <StatusBadge
            label={payment.status}
            tone={payment.status === translate('Received') ? 'active' : 'draft'}
          />
          <dl className="mt-6 grid gap-section md:grid-cols-2">
            <div>
              <dt className="text-sm text-[var(--muted)]">{translate('Invoice')}</dt>
              <dd>
                <Link
                  className="font-semibold text-[var(--accent)] hover:underline"
                  href={`/invoices/${payment.invoice.toLowerCase()}`}
                >
                  {payment.invoice}
                </Link>
              </dd>
            </div>
            {Object.entries({
              Client: payment.client,
              Date: payment.date,
              Amount: formatMoney(payment.amount),
              Method: payment.method,
              Reference: payment.reference,
            }).map(([label, value]) => (
              <div key={label}>
                <dt className="text-sm text-[var(--muted)]">{translate(label)}</dt>
                <dd className="font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  )
}
