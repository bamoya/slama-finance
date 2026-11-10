import type { BillingInvoice } from '../../../../api/generated/models'
import type { DataColumn } from '../../../../components/management/data-table'
import { StatusBadge } from '../../../../components/management/status-badge'
import { displayDateTime } from '../../../../lib/dates'
import { translate } from '../../../../lib/i18n'
import {
  cycleLabel,
  documentKindLabel,
  formatDh,
  invoiceStatus,
  planLabel,
  versionLabel,
} from './billing-format'

/** Issued invoices and credit notes; amounts never change once issued. */
export const invoiceColumns: DataColumn<BillingInvoice>[] = [
  {
    title: 'Number',
    render: (i) => (
      <>
        <span className="whitespace-nowrap font-semibold">{i.number}</span>
        <p className="text-xs text-[var(--muted)]">{documentKindLabel(i.kind)}</p>
      </>
    ),
  },
  {
    title: 'Issued',
    render: (i) => <span className="whitespace-nowrap">{displayDateTime(i.issuedAt)}</span>,
  },
  {
    title: 'Details',
    render: (i) => (
      <>
        {i.lines.map((l) => (
          <span key={l.position} className="block whitespace-nowrap">
            {planLabel(l.planCode)} · {versionLabel(l.planVersionNumber)} · {cycleLabel(l.cycle)}
          </span>
        ))}
        {i.correctsInvoiceNumber && (
          <p className="max-w-xs whitespace-normal break-words text-xs text-[var(--muted)]">
            {translate('Corrects {{number}}', { number: i.correctsInvoiceNumber })}
            {i.reason ? ` · ${i.reason}` : ''}
          </p>
        )}
      </>
    ),
  },
  {
    title: 'Total incl. tax',
    align: 'right',
    render: (i) => (
      <span className="whitespace-nowrap">
        {i.kind === 'credit_note' ? '−' : ''}
        {formatDh(i.totals.amountTtc)}
      </span>
    ),
  },
  {
    title: 'Balance',
    render: (i) => {
      if (i.kind === 'credit_note') return '—'
      const status = invoiceStatus(i.status)
      return (
        <>
          <StatusBadge label={status.label} tone={status.tone} />
          {i.balanceTtc !== 0 && (
            <p className="mt-1 whitespace-nowrap text-xs text-[var(--muted)]">
              {formatDh(Math.abs(i.balanceTtc))}
            </p>
          )}
        </>
      )
    },
  },
]
