import { Banknote, Landmark, Plus, Search, WalletCards } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'wouter'

import { PageHeader } from '../../../components/management/page-header'
import { StatusBadge } from '../../../components/management/status-badge'
import { buttonVariants } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { translate, useUiLanguage } from '../../../lib/i18n'
import { formatMoney } from '../../products'
import { payments } from '../data/payments'

export function PaymentsPage() {
  useUiLanguage()

  const [query, setQuery] = useState('')
  const visible = payments.filter((payment) =>
    `${payment.number} ${payment.invoice} ${payment.client} ${payment.method}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  )
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <PageHeader
        eyebrow={translate('Sales')}
        title={translate('Payments')}
        description={translate(
          'Track every installment received against customer invoices, including its payment method and reference.',
        )}
        actions={
          <Link href="/payments/new" className={buttonVariants({})}>
            <Plus size={17} />
            {translate('Record payment')}
          </Link>
        }
      />
      <section className="grid gap-3 sm:grid-cols-3">
        <Summary
          icon={<WalletCards />}
          value="12,400 MAD"
          label={translate('Collected this month')}
        />
        <Summary icon={<Landmark />} value="8,000 MAD" label={translate('By bank transfer')} />
        <Summary icon={<Banknote />} value="1,000 MAD" label={translate('By cash')} />
      </section>
      <section className="overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--surface)]">
        <div className="relative border-b border-[var(--border)] p-4">
          <Search className="absolute left-7 top-7 text-[var(--muted)]" size={18} />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={translate('Search payment, invoice, client or method')}
            className="pl-10"
          />
        </div>
        <div className="overflow-x-auto">
          <table data-slot="data-table" className="w-full min-w-[900px] text-left">
            <thead className="bg-[var(--surface-muted)] text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="px-5 py-3">{translate('Payment')}</th>
                <th className="px-5 py-3">{translate('Invoice')}</th>
                <th className="px-5 py-3">{translate('Client')}</th>
                <th className="px-5 py-3">{translate('Date')}</th>
                <th className="px-5 py-3">{translate('Method')}</th>
                <th className="px-5 py-3">{translate('Reference')}</th>
                <th className="px-5 py-3">{translate('Amount')}</th>
                <th className="px-5 py-3">{translate('Status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {visible.map((payment) => (
                <tr key={payment.id}>
                  <td className="px-5 py-4 font-semibold">
                    <Link
                      href={`/payments/${payment.id}`}
                      className="rounded-md hover:underline focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                    >
                      {payment.number}
                    </Link>
                  </td>
                  <td className="px-5 py-4">
                    <Link
                      href={`/invoices/${payment.invoice.toLowerCase()}`}
                      className="font-semibold text-[var(--accent)]"
                    >
                      {payment.invoice}
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-sm">{payment.client}</td>
                  <td className="px-5 py-4 text-sm text-[var(--muted)]">{payment.date}</td>
                  <td className="px-5 py-4 text-sm">{payment.method}</td>
                  <td className="px-5 py-4 text-xs text-[var(--muted)]">{payment.reference}</td>
                  <td className="px-5 py-4 font-semibold">{formatMoney(payment.amount)}</td>
                  <td className="px-5 py-4">
                    <StatusBadge
                      label={payment.status}
                      tone={payment.status === translate('Received') ? 'active' : 'draft'}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function Summary({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  useUiLanguage()

  return (
    <article className="flex items-center gap-4 rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-5">
      <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-[var(--accent-soft)] text-[var(--accent)]">
        {icon}
      </span>
      <div>
        <strong className="block text-xl">{value}</strong>
        <span className="text-xs text-[var(--muted)]">{label}</span>
      </div>
    </article>
  )
}
