import { useListOwnerSubscriptionInvoices } from '../../../../api/generated/subscriptions/subscriptions'
import { DataTable } from '../../../../components/management/data-table'
import { RequestState } from '../../../../components/management/request-state'
import { Card, CardHeader, CardTitle } from '../../../../components/ui/card'
import { translate } from '../../../../lib/i18n'
import { invoiceColumns } from './invoice-columns'

export function InvoiceHistory() {
  const list = useListOwnerSubscriptionInvoices({ query: { retry: false } })
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <CardHeader className="border-b border-[var(--border)] p-4">
        <CardTitle>{translate('Invoices')}</CardTitle>
      </CardHeader>
      {list.isPending || list.isError ? (
        <div className="p-4">
          <RequestState query={list} />
        </div>
      ) : (
        <DataTable
          items={list.data.data}
          columns={invoiceColumns}
          emptyTitle={translate('No invoices yet.')}
          emptyDescription={translate('An invoice is issued when your payment is received.')}
        />
      )}
    </Card>
  )
}
