import { useState } from 'react'

import type { BillingInvoice } from '../../../../api/generated/models'
import { useListOwnerSubscriptionInvoices } from '../../../../api/generated/subscriptions/subscriptions'
import { type DataColumn, DataTable } from '../../../../components/management/data-table'
import { DataTablePagination } from '../../../../components/management/data-table-pagination'
import { RequestState } from '../../../../components/management/request-state'
import { Card, CardHeader, CardTitle } from '../../../../components/ui/card'
import { translate } from '../../../../lib/i18n'
import { invoiceColumns } from './invoice-columns'
import { InvoicePdfButton } from './invoice-pdf-button'

const columns: DataColumn<BillingInvoice>[] = [
  ...invoiceColumns,
  {
    title: 'Actions',
    align: 'right',
    render: (i) => <InvoicePdfButton invoice={i} scope="owner" />,
  },
]

export function InvoiceHistory() {
  const [page, setPage] = useState(1)
  const list = useListOwnerSubscriptionInvoices({ page }, { query: { retry: false } })
  return (
    <section aria-label={translate('Invoices')}>
      <Card className="gap-0 overflow-hidden p-0">
        <CardHeader className="border-b border-[var(--border)] p-4">
          <CardTitle>{translate('Invoices')}</CardTitle>
        </CardHeader>
        {list.isPending || list.isError ? (
          <div className="p-4">
            <RequestState query={list} />
          </div>
        ) : (
          <>
            <DataTable
              items={list.data.items}
              columns={columns}
              emptyTitle={translate('No invoices yet.')}
              emptyDescription={translate('An invoice is issued when your payment is received.')}
            />
            <DataTablePagination
              total={list.data.total}
              page={list.data.page}
              pageSize={list.data.pageSize}
              onPage={setPage}
              disabled={list.isFetching}
            />
          </>
        )}
      </Card>
    </section>
  )
}
