import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'wouter'

import { PageHeader } from '../../../../components/management/page-header'
import { RequestState } from '../../../../components/management/request-state'
import { StatusBadge } from '../../../../components/management/status-badge'
import { useUiLanguage } from '../../../../lib/i18n'
import { Can, useAuthorization } from '../../../identity'
import { useBankAccounts } from '../../../settings'
import { useInvoice } from '../../invoices/queries'
import { InvoiceBalance } from '../components/invoice-balance'
import { PaymentActions } from '../components/payment-actions'
import { PaymentReceiptActions } from '../components/payment-receipt-actions'
import { usePayment } from '../queries'

export function PaymentDetailPage() {
  useUiLanguage()

  const { t } = useTranslation('sales')
  const { can } = useAuthorization()
  const { paymentId = '' } = useParams<{ paymentId: string }>()
  const payment = usePayment(paymentId)
  const invoice = useInvoice(
    payment.data?.invoiceId ?? '',
    Boolean(payment.data && can('invoices.read')),
  )
  const banks = useBankAccounts(Boolean(payment.data?.bankAccountId && can('bank_accounts.read')))
  if (payment.isPending || payment.isError)
    return (
      <div className="mx-auto max-w-[1500px] p-page">
        <RequestState query={payment} />
      </div>
    )
  const row = payment.data
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <Link
        href="/payments"
        className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--muted)]"
      >
        <ArrowLeft size={16} />
        {t('backToPayments')}
      </Link>
      <PageHeader
        eyebrow={t('payments')}
        title={row.number}
        description={`${row.amount} ${row.currency}`}
        actions={
          <>
            <StatusBadge
              label={t(row.status)}
              tone={
                row.status === 'cancelled'
                  ? 'archived'
                  : row.status === 'pending'
                    ? 'draft'
                    : 'active'
              }
            />
            <PaymentReceiptActions payment={row} />
            <PaymentActions payment={row} />
          </>
        }
      />
      <div className="grid gap-section lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <div className="grid content-start gap-section">
          <section className="grid gap-4 rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
            <h2 className="text-lg font-bold">{t('paymentDetails')}</h2>
            {row.receiptIssuedAt && (
              <p className="text-sm text-muted-foreground">
                {t('receiptIssuedNotice', { number: row.receiptNumber })}
              </p>
            )}
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[var(--muted)]">{t('client')}</dt>
                <dd>
                  <Can permission="clients.read" fallback={<span>{row.clientName}</span>}>
                    <Link
                      href={`/clients/${row.clientId}`}
                      className="font-semibold text-[var(--accent)]"
                    >
                      {row.clientName}
                    </Link>
                  </Can>
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">{t('invoice')}</dt>
                <dd>
                  <Can permission="invoices.read" fallback={<span>{row.invoiceNumber}</span>}>
                    <Link
                      href={`/invoices/${row.invoiceId}`}
                      className="font-semibold text-[var(--accent)]"
                    >
                      {row.invoiceNumber}
                    </Link>
                  </Can>
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">{t('paymentDate')}</dt>
                <dd>{row.paymentDate}</dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">{t('collectedOn')}</dt>
                <dd>{row.collectedOn ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">{t('method')}</dt>
                <dd>{t(row.method)}</dd>
              </div>
              {row.bankAccountId && can('bank_accounts.read') && (
                <div>
                  <dt className="text-[var(--muted)]">{t('bankAccount')}</dt>
                  <dd>{banks.data?.find((bank) => bank.id === row.bankAccountId)?.name ?? '—'}</dd>
                </div>
              )}
              {row.reference && (
                <div>
                  <dt className="text-[var(--muted)]">{t('reference')}</dt>
                  <dd>{row.reference}</dd>
                </div>
              )}
              {row.chequeBank && (
                <div>
                  <dt className="text-[var(--muted)]">{t('chequeBank')}</dt>
                  <dd>{row.chequeBank}</dd>
                </div>
              )}
              {row.chequeNumber && (
                <div>
                  <dt className="text-[var(--muted)]">{t('chequeNumber')}</dt>
                  <dd>{row.chequeNumber}</dd>
                </div>
              )}
              {row.cancellationReason && (
                <div>
                  <dt className="text-[var(--muted)]">{t('cancellationReason')}</dt>
                  <dd>{row.cancellationReason}</dd>
                </div>
              )}
            </dl>
          </section>
        </div>
        <div>{invoice.data && <InvoiceBalance invoice={invoice.data} />}</div>
      </div>
    </div>
  )
}
