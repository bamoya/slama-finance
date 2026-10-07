import {
  Download,
  FileCheck2,
  FileClock,
  Pencil,
  Plus,
  Search,
  Send,
  SlidersHorizontal,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'wouter'

import { ActionLink } from '../../../components/management/action-link'
import { PageHeader } from '../../../components/management/page-header'
import { StatusBadge } from '../../../components/management/status-badge'
import { Button, buttonVariants } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { translate, useUiLanguage } from '../../../lib/i18n'
import { formatMoney } from '../../products'
import { estimates, invoices } from '../data/documents'

export function DocumentListPage({ kind }: { kind: 'Invoice' | 'Estimate' }) {
  useUiLanguage()

  const [query, setQuery] = useState('')
  const documents = (kind === 'Invoice' ? invoices : estimates).filter((doc) =>
    `${doc.number} ${doc.client}`.toLowerCase().includes(query.toLowerCase()),
  )
  const base = kind === 'Invoice' ? 'invoices' : 'estimates'
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <PageHeader
        eyebrow={translate('Sales')}
        title={`${kind}s`}
        description={
          kind === translate('Invoice')
            ? translate('Create, deliver and follow every customer invoice from draft to payment.')
            : translate(
                'Prepare offers, collect decisions and convert accepted work into invoices.',
              )
        }
        actions={
          <>
            <Button variant="outline">
              <Download size={17} />
              {translate('Export')}
            </Button>
            <Link href={`/${base}/new`} className={buttonVariants({})}>
              <Plus size={17} />
              {translate('New')} {kind.toLowerCase()}
            </Link>
          </>
        }
      />
      <section className="grid gap-3 sm:grid-cols-3">
        <Summary
          icon={<FileClock />}
          value={kind === translate('Invoice') ? '3' : '2'}
          label={translate('Open documents')}
        />
        <Summary
          icon={<Send />}
          value={kind === translate('Invoice') ? '21' : '8'}
          label={translate('Sent this month')}
        />
        <Summary
          icon={<FileCheck2 />}
          value={kind === translate('Invoice') ? '84,200 MAD' : '62%'}
          label={
            kind === translate('Invoice')
              ? translate('Collected this month')
              : translate('Acceptance rate')
          }
        />
      </section>
      <section className="overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--surface)] shadow-sm">
        <div className="flex gap-3 border-b border-[var(--border)] p-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 text-[var(--muted)]" size={18} />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={translate('Search {{value0}}s', { value0: kind.toLowerCase() })}
              className="h-11 w-full rounded-[14px] bg-[var(--surface-muted)] pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-[var(--accent-soft)]"
            />
          </div>
          <Button variant="outline">
            <SlidersHorizontal size={17} />
            {translate('Filters')}
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table data-slot="data-table" className="w-full min-w-[850px] text-left">
            <thead className="bg-[var(--surface-muted)] text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-5 py-3">{translate('Number')}</th>
                <th className="px-5 py-3">{translate('Client')}</th>
                <th className="px-5 py-3">{translate('Issued')}</th>
                <th className="px-5 py-3">{translate('Due / valid until')}</th>
                <th className="px-5 py-3">{translate('Total')}</th>
                {kind === translate('Invoice') && (
                  <th className="px-5 py-3">{translate('Payment')}</th>
                )}
                <th className="px-5 py-3">{translate('Status')}</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-[var(--surface-hover)]">
                  <td className="px-5 py-4">
                    <Link
                      href={`/${base}/${doc.id}`}
                      className="font-semibold text-[var(--text)] hover:text-[var(--accent)]"
                    >
                      {doc.number}
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-sm">{doc.client}</td>
                  <td className="px-5 py-4 text-sm text-[var(--muted)]">{doc.issued}</td>
                  <td className="px-5 py-4 text-sm text-[var(--muted)]">{doc.due}</td>
                  <td className="px-5 py-4 text-sm font-semibold">{formatMoney(doc.total)}</td>
                  {kind === translate('Invoice') && (
                    <td className="px-5 py-4">
                      <div className="min-w-28 text-xs">
                        <div className="mb-2 flex justify-between gap-2">
                          <span className="font-semibold">{formatMoney(doc.paidAmount ?? 0)}</span>
                          <span className="text-[var(--muted)]">{translate('paid')}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{
                              width: `${Math.min(100, ((doc.paidAmount ?? 0) / doc.total) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    </td>
                  )}
                  <td className="px-5 py-4">
                    <StatusBadge
                      label={doc.status}
                      tone={
                        doc.status === translate('Overdue')
                          ? 'overdue'
                          : doc.status === translate('Paid') || doc.status === translate('Accepted')
                            ? 'active'
                            : 'draft'
                      }
                    />
                  </td>
                  <td className="px-5 py-4">
                    <ActionLink href={`/${base}/${doc.id}/edit`} label={translate('Edit')}>
                      <Pencil size={16} aria-hidden="true" />
                    </ActionLink>
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
