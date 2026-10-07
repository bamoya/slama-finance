import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'wouter'

import type { ListPaymentsParams, PaymentPageItemsItem } from '../../../../api/generated/models'
import { DataTablePagination } from '../../../../components/management/data-table-pagination'
import { PageHeader } from '../../../../components/management/page-header'
import { RequestState } from '../../../../components/management/request-state'
import { StatusBadge } from '../../../../components/management/status-badge'
import { useTableSelection } from '../../../../components/management/use-table-selection'
import { buttonVariants } from '../../../../components/ui/button'
import { useUiLanguage } from '../../../../lib/i18n'
import { Can, useAuthorization } from '../../../identity'
import { DocumentFilters } from '../../components/document-filters'
import { type DocumentColumn, DocumentTable } from '../../components/document-table'
import { SalesBulkActions } from '../../components/sales-bulk-actions'
import { useDocumentFilters } from '../../components/use-document-filters'
import { usePayments } from '../queries'

const statuses = ['pending', 'confirmed', 'cancelled'] as const
const methods = ['cash', 'bank_transfer', 'cheque'] as const
const sorts = ['newest', 'oldest', 'amount_asc', 'amount_desc'] as const
const allowed = { status: ['', ...statuses], method: ['', ...methods], sort: ['', ...sorts] }

export function PaymentsPage() {
  useUiLanguage()

  const { t } = useTranslation('sales')
  const filters = useDocumentFilters(allowed)
  const { can } = useAuthorization()
  const canBulk = ['read', 'update', 'delete'].some((action) => can(`payments.${action}`))
  const pageSize = [10, 25, 50].includes(Number(filters.get('pageSize')))
    ? Number(filters.get('pageSize'))
    : 25
  const query = usePayments({
    search: filters.get('search') || undefined,
    invoiceId: filters.get('invoiceId') || undefined,
    clientId: filters.get('clientId') || undefined,
    status: (filters.get('status') || undefined) as ListPaymentsParams['status'],
    method: (filters.get('method') || undefined) as ListPaymentsParams['method'],
    dateFrom: filters.get('dateFrom') || undefined,
    dateTo: filters.get('dateTo') || undefined,
    sort: (filters.get('sort') || 'newest') as ListPaymentsParams['sort'],
    limit: pageSize,
    offset: (filters.page - 1) * pageSize,
  })
  const selection = useTableSelection(query.data?.items ?? [], filters.scope)
  const columns: DocumentColumn<PaymentPageItemsItem>[] = [
    {
      title: t('payment'),
      render: (row) => (
        <Link href={`/payments/${row.id}`} className="font-semibold hover:text-[var(--accent)]">
          {row.number}
        </Link>
      ),
    },
    {
      title: t('client'),
      render: (row) => (
        <Can permission="clients.read" fallback={<span>{row.clientName}</span>}>
          <Link href={`/clients/${row.clientId}`} className="hover:text-[var(--accent)]">
            {row.clientName}
          </Link>
        </Can>
      ),
    },
    {
      title: t('invoice'),
      render: (row) => (
        <Can permission="invoices.read" fallback={<span>{row.invoiceNumber}</span>}>
          <Link href={`/invoices/${row.invoiceId}`} className="hover:text-[var(--accent)]">
            {row.invoiceNumber}
          </Link>
        </Can>
      ),
    },
    { title: t('paymentDate'), render: (row) => row.paymentDate },
    { title: t('method'), render: (row) => t(row.method) },
    {
      title: t('amount'),
      align: 'right',
      render: (row) => (
        <strong>
          {row.amount} {row.currency}
        </strong>
      ),
    },
    {
      title: t('status'),
      render: (row) => (
        <StatusBadge
          label={t(row.status)}
          tone={
            row.status === 'cancelled' ? 'archived' : row.status === 'pending' ? 'draft' : 'active'
          }
        />
      ),
    },
  ]
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <PageHeader
        eyebrow={t('sales')}
        title={t('payments')}
        description={t('paymentDescription')}
        actions={
          <Can permission={['payments.create', 'invoices.read']}>
            <Link href="/payments/new" className={buttonVariants({})}>
              <Plus size={17} />
              {t('newPayment')}
            </Link>
          </Can>
        }
      />
      <section className="overflow-hidden rounded-panel border border-[var(--border)] bg-[var(--surface)]">
        <DocumentFilters
          filters={filters}
          statuses={statuses.map((value) => ({ value, label: t(value) }))}
          sorts={sorts.map((value) => ({
            value,
            label: t(
              value === 'amount_asc' ? 'amountLow' : value === 'amount_desc' ? 'amountHigh' : value,
            ),
          }))}
          sortKey="sort"
          showOrder={false}
          extra={[
            {
              key: 'method',
              label: t('method'),
              options: [
                { value: '', label: t('filterPaymentMethod') },
                ...methods.map((value) => ({ value, label: t(value) })),
              ],
            },
          ]}
        />
        {canBulk && (
          <SalesBulkActions
            resource="payments"
            selected={selection.selected}
            clear={selection.clear}
          />
        )}
        {query.isPending || query.isError ? (
          <div className="p-5">
            <RequestState query={query} />
          </div>
        ) : (
          <DocumentTable
            selection={canBulk ? selection : undefined}
            selectionName={(row) => row.number ?? row.id}
            items={query.data.items}
            columns={columns}
            emptyTitle={t('noPayments')}
            emptyDescription={t('adjustFilters')}
          />
        )}
        {query.data && (
          <DataTablePagination
            onPageSizeChange={(size) => filters.set('pageSize', String(size))}
            disabled={query.isFetching}
            page={filters.page}
            pageSize={pageSize}
            total={query.data.total}
            onPage={(value) => filters.set('page', String(value))}
          />
        )}
      </section>
    </div>
  )
}
