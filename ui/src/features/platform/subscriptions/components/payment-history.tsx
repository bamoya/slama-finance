import type { ListOwnerSubscriptionPayments200DataItem } from '../../../../api/generated/models'
import { useListOwnerSubscriptionPayments } from '../../../../api/generated/subscriptions/subscriptions'
import { type DataColumn, DataTable } from '../../../../components/management/data-table'
import { RequestState } from '../../../../components/management/request-state'
import { StatusBadge } from '../../../../components/management/status-badge'
import { Card, CardHeader, CardTitle } from '../../../../components/ui/card'
import { displayDateTime } from '../../../../lib/dates'
import { translate } from '../../../../lib/i18n'
import {
  cycleLabel,
  formatDh,
  isAdjustmentMarker,
  paymentKindLabel,
  paymentMethodLabel,
  paymentStatusTone,
  planLabel,
} from './billing-format'

const statusLabel = {
  confirmed: 'Confirmed',
  rejected: 'Rejected',
  submitted: 'Awaiting verification',
} as const

const columns: DataColumn<ListOwnerSubscriptionPayments200DataItem>[] = [
  {
    title: 'Submitted',
    render: (p) => <span className="whitespace-nowrap">{displayDateTime(p.submittedAt)}</span>,
  },
  { title: 'Type', render: (p) => paymentKindLabel(p.kind) },
  {
    title: 'Plan',
    render: (p) => (
      <span className="whitespace-nowrap">
        {planLabel(p.planCode)} · {cycleLabel(p.cycle)}
      </span>
    ),
  },
  {
    title: 'Method',
    render: (p) => (isAdjustmentMarker(p.method) ? '—' : paymentMethodLabel(p.method)),
  },
  {
    title: 'Reference',
    render: (p) => (
      <span className="break-all">{isAdjustmentMarker(p.reference) ? '—' : p.reference}</span>
    ),
  },
  {
    title: 'Total incl. tax',
    align: 'right',
    render: (p) => <span className="whitespace-nowrap">{formatDh(p.amount.amountTtc)}</span>,
  },
  {
    title: 'Status',
    render: (p) => (
      <>
        <StatusBadge label={statusLabel[p.status]} tone={paymentStatusTone(p.status)} />
        {p.status === 'rejected' && p.rejectionReason && (
          <p className="mt-1 max-w-xs whitespace-normal break-words text-xs text-[var(--muted)]">
            {translate('Reason:')} {p.rejectionReason}
          </p>
        )}
      </>
    ),
  },
  {
    title: 'Coverage',
    render: (p) => (
      <span className="whitespace-nowrap">
        {p.coverageStart && p.coverageEnd
          ? `${displayDateTime(p.coverageStart)} → ${displayDateTime(p.coverageEnd)}`
          : '—'}
      </span>
    ),
  },
]

export function PaymentHistory() {
  const list = useListOwnerSubscriptionPayments({ query: { retry: false } })
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <CardHeader className="border-b border-[var(--border)] p-4">
        <CardTitle>{translate('Payment history')}</CardTitle>
      </CardHeader>
      {list.isPending || list.isError ? (
        <div className="p-4">
          <RequestState query={list} />
        </div>
      ) : (
        <DataTable
          items={list.data.data}
          columns={columns}
          emptyTitle={translate('No payments yet.')}
          emptyDescription={translate('Payments you submit appear here.')}
        />
      )}
    </Card>
  )
}
