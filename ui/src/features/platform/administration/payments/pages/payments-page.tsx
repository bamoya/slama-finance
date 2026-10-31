import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import {
  useConfirmAdminPayment,
  useListAdminPayments,
  useRejectAdminPayment,
} from '../../../../../api/generated/administration/administration'
import type { AdminPayment } from '../../../../../api/generated/models'
import { DataTablePagination } from '../../../../../components/management/data-table-pagination'
import { RequestState } from '../../../../../components/management/request-state'
import { StatusBadge } from '../../../../../components/management/status-badge'
import { Button } from '../../../../../components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '../../../../../components/ui/tabs'
import { displayDateTime } from '../../../../../lib/dates'
import { translate, useUiLanguage } from '../../../../../lib/i18n'
import {
  cycleLabel,
  formatDh,
  paymentKindLabel,
  paymentStatusTone,
  planLabel,
} from '../../../subscriptions/components/billing-format'
import { AdministrationLayout } from '../../shared/components/administration-layout'
import { ScrollingTable } from '../../shared/components/scrolling-table'
import { type Decision, PaymentDecisionDialog } from '../components/payment-decision-dialog'

const statuses = [
  { value: 'submitted', label: 'Awaiting verification' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'rejected', label: 'Rejected' },
] as const

export function AdminPaymentsPage() {
  useUiLanguage()
  const client = useQueryClient()
  const [status, setStatus] = useState<(typeof statuses)[number]['value']>('submitted')
  const [page, setPage] = useState(1)
  const [active, setActive] = useState<{ payment: AdminPayment; decision: Decision } | null>(null)
  const query = useListAdminPayments({ status, page }, { query: { retry: false } })
  const confirm = useConfirmAdminPayment()
  const reject = useRejectAdminPayment()
  const refresh = () =>
    client.invalidateQueries({
      predicate: ({ queryKey }) =>
        typeof queryKey[0] === 'string' &&
        (queryKey[0].startsWith('/v1/admin/payments') ||
          queryKey[0].startsWith('/v1/admin/owners')),
    })
  return (
    <AdministrationLayout title="Payments">
      <Tabs
        value={status}
        onValueChange={(value) => {
          setStatus(value as typeof status)
          setPage(1)
        }}
      >
        <TabsList aria-label={translate('Payment status')}>
          {statuses.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {translate(item.label)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {query.isPending || query.isError ? (
        <RequestState query={query} />
      ) : (
        <section aria-label={translate('Payments')} className="space-y-4">
          <ScrollingTable>
            <thead>
              <tr>
                <th>{translate('Owner')}</th>
                <th>{translate('Plan')}</th>
                <th>{translate('Type')}</th>
                <th>{translate('Method')}</th>
                <th>{translate('Reference')}</th>
                <th className="text-right">{translate('Total incl. tax')}</th>
                <th>{translate('Submitted')}</th>
                <th>{translate('Status')}</th>
                <th>
                  <span className="sr-only">{translate('Actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {!query.data.items.length && (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-[var(--muted)]">
                    {translate('No payments for this status.')}
                  </td>
                </tr>
              )}
              {query.data.items.map((p) => (
                <tr key={p.id} className="border-t border-[var(--border)]">
                  <td className="break-all">{p.ownerEmail}</td>
                  <td className="whitespace-nowrap">
                    {planLabel(p.planCode)} · {cycleLabel(p.cycle)}
                  </td>
                  <td>{paymentKindLabel(p.kind)}</td>
                  <td>{p.method}</td>
                  <td className="break-all">{p.reference}</td>
                  <td className="whitespace-nowrap text-right">{formatDh(p.amount.amountTtc)}</td>
                  <td className="whitespace-nowrap">{displayDateTime(p.submittedAt)}</td>
                  <td>
                    <StatusBadge
                      label={statuses.find((s) => s.value === p.status)?.label ?? p.status}
                      tone={paymentStatusTone(p.status)}
                    />
                    {p.rejectionReason && (
                      <p className="mt-1 text-xs text-[var(--muted)]">{p.rejectionReason}</p>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    {p.status === 'submitted' && (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          onClick={() => setActive({ payment: p, decision: 'confirm' })}
                        >
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
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </ScrollingTable>
          <DataTablePagination
            total={query.data.total}
            page={query.data.page}
            pageSize={query.data.pageSize}
            onPage={setPage}
          />
        </section>
      )}
      {active && (
        <PaymentDecisionDialog
          payment={active.payment}
          decision={active.decision}
          onClose={() => setActive(null)}
          onConfirm={async (receivedReference) => {
            await confirm.mutateAsync({
              paymentId: active.payment.id,
              data: receivedReference ? { receivedReference } : {},
            })
            await refresh()
          }}
          onReject={async (reason) => {
            await reject.mutateAsync({ paymentId: active.payment.id, data: { reason } })
            await refresh()
          }}
        />
      )}
    </AdministrationLayout>
  )
}
