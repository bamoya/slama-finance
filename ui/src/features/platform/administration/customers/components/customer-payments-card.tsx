import type { AdminOwnerDetailPaymentsItem } from '../../../../../api/generated/models'
import { type DataColumn, DataTable } from '../../../../../components/management/data-table'
import { StatusBadge } from '../../../../../components/management/status-badge'
import { Card, CardHeader, CardTitle } from '../../../../../components/ui/card'
import { displayDateTime } from '../../../../../lib/dates'
import { translate } from '../../../../../lib/i18n'
import {
  cycleLabel,
  formatDh,
  isAdjustmentMarker,
  paymentKindLabel,
  paymentStatusTone,
  planLabel,
  versionLabel,
} from '../../../subscriptions/components/billing-format'

const paymentStatus = {
  confirmed: 'Confirmed',
  rejected: 'Rejected',
  submitted: 'Awaiting verification',
} as const

type CustomerPayment = AdminOwnerDetailPaymentsItem

/** Free administrator adjustments (plan change, extension) are recorded as 0 DH confirmed rows. */
const isAdjustment = (p: CustomerPayment) =>
  (p.kind as string) === 'admin_adjustment' ||
  (p.status === 'confirmed' && p.amount.amountTtc === 0)

const columns: DataColumn<CustomerPayment>[] = [
  {
    title: 'Submitted',
    render: (p) => <span className="whitespace-nowrap">{displayDateTime(p.submittedAt)}</span>,
  },
  {
    title: 'Type',
    render: (p) => (isAdjustment(p) ? translate('Admin adjustment') : paymentKindLabel(p.kind)),
  },
  {
    title: 'Plan',
    render: (p) => (
      <span className="whitespace-nowrap">
        {planLabel(p.planCode)} · {versionLabel(p.planVersionNumber)} · {cycleLabel(p.cycle)}
      </span>
    ),
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
        <StatusBadge label={paymentStatus[p.status]} tone={paymentStatusTone(p.status)} />
        {p.rejectionReason && (
          <p className="mt-1 max-w-xs whitespace-normal break-words text-xs text-[var(--muted)]">
            {translate('Reason:')} {p.rejectionReason}
          </p>
        )}
      </>
    ),
  },
]

export function CustomerPaymentsCard({ payments }: { payments: CustomerPayment[] }) {
  return (
    <section aria-label={translate('Payment history')}>
      <Card className="gap-0 overflow-hidden p-0">
        <CardHeader className="border-b border-[var(--border)] p-4">
          <CardTitle>{translate('Payment history')}</CardTitle>
        </CardHeader>
        <DataTable
          items={payments}
          columns={columns}
          emptyTitle={translate('No payments yet.')}
          emptyDescription={translate('Payments submitted by this customer appear here.')}
        />
      </Card>
    </section>
  )
}
