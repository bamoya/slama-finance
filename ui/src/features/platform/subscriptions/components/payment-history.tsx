import { useListOwnerSubscriptionPayments } from '../../../../api/generated/subscriptions/subscriptions'
import { RequestState } from '../../../../components/management/request-state'
import { StatusBadge } from '../../../../components/management/status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card'
import { displayDateTime } from '../../../../lib/dates'
import { translate } from '../../../../lib/i18n'
import {
  cycleLabel,
  formatDh,
  paymentKindLabel,
  paymentStatusTone,
  planLabel,
} from './billing-format'

export function PaymentHistory() {
  const list = useListOwnerSubscriptionPayments({ query: { retry: false } })
  return (
    <Card>
      <CardHeader>
        <CardTitle>{translate('Payment history')}</CardTitle>
      </CardHeader>
      <CardContent>
        {list.isPending || list.isError ? (
          <RequestState query={list} />
        ) : (
          <div className="overflow-x-auto">
            <table data-slot="data-table" className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th>{translate('Submitted')}</th>
                  <th>{translate('Type')}</th>
                  <th>{translate('Plan')}</th>
                  <th>{translate('Method')}</th>
                  <th>{translate('Reference')}</th>
                  <th className="text-right">{translate('Total incl. tax')}</th>
                  <th>{translate('Status')}</th>
                  <th>{translate('Coverage')}</th>
                </tr>
              </thead>
              <tbody>
                {!list.data.data.length && (
                  <tr>
                    <td colSpan={8} className="p-panel text-center text-muted-foreground">
                      {translate('No payments yet.')}
                    </td>
                  </tr>
                )}
                {list.data.data.map((p) => (
                  <tr key={p.id}>
                    <td className="whitespace-nowrap">{displayDateTime(p.submittedAt)}</td>
                    <td>{paymentKindLabel(p.kind)}</td>
                    <td>
                      {planLabel(p.planCode)} · {cycleLabel(p.cycle)}
                    </td>
                    <td>{p.method}</td>
                    <td>{p.reference}</td>
                    <td className="whitespace-nowrap text-right">{formatDh(p.amount.amountTtc)}</td>
                    <td>
                      <StatusBadge
                        label={
                          p.status === 'confirmed'
                            ? 'Confirmed'
                            : p.status === 'rejected'
                              ? 'Rejected'
                              : 'Awaiting verification'
                        }
                        tone={paymentStatusTone(p.status)}
                      />
                    </td>
                    <td className="whitespace-nowrap">
                      {p.coverageStart && p.coverageEnd
                        ? `${displayDateTime(p.coverageStart)} → ${displayDateTime(p.coverageEnd)}`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
