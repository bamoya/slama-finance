import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import {
  useConfirmAdminPayment,
  useListAdminPayments,
  useRejectAdminPayment,
} from '../../../../../api/generated/administration/administration'
import type { AdminPayment } from '../../../../../api/generated/models'
import { type DataColumn, DataTable } from '../../../../../components/management/data-table'
import { DataTablePagination } from '../../../../../components/management/data-table-pagination'
import { DataTableToolbar } from '../../../../../components/management/data-table-toolbar'
import { RequestState } from '../../../../../components/management/request-state'
import { StatusBadge } from '../../../../../components/management/status-badge'
import { Button } from '../../../../../components/ui/button'
import { Card } from '../../../../../components/ui/card'
import { Select, SelectGroup, SelectOption } from '../../../../../components/ui/select'
import { displayDateTime } from '../../../../../lib/dates'
import { translate, useUiLanguage } from '../../../../../lib/i18n'
import {
  cycleLabel,
  formatDh,
  paymentKindLabel,
  paymentMethodLabel,
  paymentStatusTone,
  planLabel,
} from '../../../subscriptions/components/billing-format'
import { AdministrationLayout } from '../../shared/components/administration-layout'
import { AdministrationPageHeader } from '../../shared/components/administration-page-header'
import { useUrlFilters } from '../../shared/hooks/use-url-filters'
import { type Decision, PaymentDecisionDialog } from '../components/payment-decision-dialog'

const statuses = [
  { value: 'submitted', label: 'Awaiting verification' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'rejected', label: 'Rejected' },
] as const

type PaymentStatus = (typeof statuses)[number]['value']

export function AdminPaymentsPage() {
  useUiLanguage()
  const client = useQueryClient()
  const { values, change } = useUrlFilters(['status', 'page'])
  const status: PaymentStatus =
    statuses.find((item) => item.value === values.status)?.value ?? 'submitted'
  const page = Math.max(1, Number.parseInt(values.page, 10) || 1)
  const [active, setActive] = useState<{ payment: AdminPayment; decision: Decision } | null>(null)
  const query = useListAdminPayments({ status, page }, { query: { retry: false } })
  const confirm = useConfirmAdminPayment()
  const reject = useRejectAdminPayment()
  const refresh = () =>
    client.invalidateQueries({
      predicate: ({ queryKey }) =>
        typeof queryKey[0] === 'string' &&
        (queryKey[0].startsWith('/api/v1/admin/payments') ||
          queryKey[0].startsWith('/api/v1/admin/owners') ||
          queryKey[0].startsWith('/api/v1/admin/overview')),
    })
  const columns: DataColumn<AdminPayment>[] = [
    { title: 'Customer', render: (p) => <span className="break-all">{p.ownerEmail}</span> },
    {
      title: 'Plan',
      render: (p) => (
        <>
          <span className="whitespace-nowrap">
            {planLabel(p.planCode)} · {cycleLabel(p.cycle)}
          </span>
          <p className="text-xs text-[var(--muted)]">{paymentKindLabel(p.kind)}</p>
        </>
      ),
    },
    {
      title: 'Reference',
      render: (p) => (
        <>
          <span className="break-all">{p.reference}</span>
          <p className="text-xs text-[var(--muted)]">{paymentMethodLabel(p.method)}</p>
        </>
      ),
    },
    {
      title: 'Total incl. tax',
      align: 'right',
      render: (p) => <span className="whitespace-nowrap">{formatDh(p.amount.amountTtc)}</span>,
    },
    {
      title: 'Submitted',
      render: (p) => <span className="whitespace-nowrap">{displayDateTime(p.submittedAt)}</span>,
    },
    {
      title: 'Status',
      render: (p) => (
        <>
          <StatusBadge
            label={statuses.find((s) => s.value === p.status)?.label ?? p.status}
            tone={paymentStatusTone(p.status)}
          />
          {p.rejectionReason && (
            <p className="mt-1 text-xs text-[var(--muted)]">{p.rejectionReason}</p>
          )}
        </>
      ),
    },
    {
      title: 'Actions',
      align: 'right',
      render: (p) =>
        p.status === 'submitted' && (
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={() => setActive({ payment: p, decision: 'confirm' })}>
              {translate('Confirm')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setActive({ payment: p, decision: 'reject' })}
            >
              {translate('Reject')}
            </Button>
          </div>
        ),
    },
  ]
  return (
    <AdministrationLayout title="Payments">
      <AdministrationPageHeader
        title="Payments"
        description="Verify bank transfers and confirm or reject subscription payments."
      />
      <section aria-label={translate('Payments')}>
        <Card className="gap-0 overflow-hidden p-0">
          <DataTableToolbar>
            <label className="table-filter grid min-w-56">
              <span className="sr-only">{translate('Payment status')}</span>
              <Select
                aria-label={translate('Payment status')}
                value={status}
                onValueChange={(value) => change({ status: value })}
              >
                <SelectGroup>
                  {statuses.map((item) => (
                    <SelectOption key={item.value} value={item.value}>
                      {translate(item.label)}
                    </SelectOption>
                  ))}
                </SelectGroup>
              </Select>
            </label>
          </DataTableToolbar>
          {query.isPending || query.isError ? (
            <div className="p-4">
              <RequestState query={query} />
            </div>
          ) : (
            <>
              <DataTable
                items={query.data.items}
                columns={columns}
                emptyTitle={translate('No payments for this status.')}
                emptyDescription={translate('Payments appear here once customers submit them.')}
              />
              <DataTablePagination
                total={query.data.total}
                page={query.data.page}
                pageSize={query.data.pageSize}
                onPage={(next) => change({ page: String(next) })}
                disabled={query.isFetching}
              />
            </>
          )}
        </Card>
      </section>
      {active && (
        <PaymentDecisionDialog
          key={`${active.payment.id}-${active.decision}`}
          payment={active.payment}
          decision={active.decision}
          onClose={() => setActive(null)}
          onConfirm={async (receivedReference, auditReason, code) => {
            await confirm.mutateAsync({
              paymentId: active.payment.id,
              data: { code, auditReason, ...(receivedReference ? { receivedReference } : {}) },
            })
            await refresh()
          }}
          onReject={async (reason, auditReason, code) => {
            await reject.mutateAsync({
              paymentId: active.payment.id,
              data: { reason, auditReason, code },
            })
            await refresh()
          }}
        />
      )}
    </AdministrationLayout>
  )
}
