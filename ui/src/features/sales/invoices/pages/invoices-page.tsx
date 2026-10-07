import { Pencil, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'wouter'

import type { InvoicePageItemsItem, ListInvoicesParams } from '../../../../api/generated/models'
import { ActionLink } from '../../../../components/management/action-link'
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
import { useInvoices } from '../queries'

const statusValues = ['draft', 'issued', 'sent', 'cancelled'] as const
const sortValues = [
  'createdAt',
  'issueDate',
  'dueDate',
  'number',
  'clientName',
  'total',
  'outstandingAmount',
] as const
const sources = ['direct', 'estimate', 'delivery'] as const
const paymentStates = ['unpaid', 'partial', 'paid'] as const
const allowed = {
  status: ['', ...statusValues],
  sortBy: ['', ...sortValues],
  sortOrder: ['', 'asc', 'desc'],
  source: ['', ...sources],
  paymentStatus: ['', ...paymentStates],
  overdue: ['', 'true'],
}

export function InvoicesPage() {
  useUiLanguage()

  const { t } = useTranslation('sales')
  const filters = useDocumentFilters(allowed)
  const { can } = useAuthorization()
  const canBulk = ['read', 'update', 'delete'].some((action) => can(`invoices.${action}`))
  const pageSize = [10, 25, 50].includes(Number(filters.get('pageSize')))
    ? Number(filters.get('pageSize'))
    : 25
  const query = useInvoices({
    search: filters.get('search') || undefined,
    clientId: filters.get('clientId') || undefined,
    status: (filters.get('status') || 'all') as ListInvoicesParams['status'],
    dateFrom: filters.get('dateFrom') || undefined,
    dateTo: filters.get('dateTo') || undefined,
    amountMin: filters.number('amountMin') || undefined,
    amountMax: filters.number('amountMax') || undefined,
    source: (filters.get('source') || 'all') as ListInvoicesParams['source'],
    paymentStatus: (filters.get('paymentStatus') || 'all') as ListInvoicesParams['paymentStatus'],
    overdue: filters.get('overdue') === 'true' || undefined,
    sortBy: (filters.get('sortBy') || 'createdAt') as ListInvoicesParams['sortBy'],
    sortOrder: (filters.get('sortOrder') || 'desc') as ListInvoicesParams['sortOrder'],
    page: filters.page,
    pageSize,
  })
  const selection = useTableSelection(query.data?.items ?? [], filters.scope)
  const columns: DocumentColumn<InvoicePageItemsItem>[] = [
    {
      title: t('invoice'),
      render: (row) => (
        <Link href={`/invoices/${row.id}`} className="font-semibold hover:text-[var(--accent)]">
          {row.number ?? t('draftInvoice')}
        </Link>
      ),
    },
    {
      title: t('client'),
      render: (row) => (
        <Can permission="clients.read" fallback={<span>{row.clientDisplayName}</span>}>
          <Link href={`/clients/${row.clientId}`} className="hover:text-[var(--accent)]">
            {row.clientDisplayName}
          </Link>
        </Can>
      ),
    },
    { title: t('issueDate'), render: (row) => row.issueDate },
    { title: t('dueDate'), render: (row) => row.dueDate ?? '—' },
    {
      title: t('total'),
      render: (row) => (
        <strong>
          {row.total} {row.currency}
        </strong>
      ),
      align: 'right',
    },
    {
      title: t('outstandingAmount'),
      render: (row) => `${row.outstandingAmount} ${row.currency}`,
      align: 'right',
    },
    {
      title: t('paymentStatus'),
      render: (row) => (
        <StatusBadge
          label={t(row.paymentStatus)}
          tone={row.paymentStatus === 'unpaid' ? 'draft' : 'active'}
        />
      ),
    },
    {
      title: t('status'),
      render: (row) => (
        <StatusBadge
          label={t(row.status)}
          tone={
            row.status === 'draft' ? 'draft' : row.status === 'cancelled' ? 'archived' : 'active'
          }
        />
      ),
    },
    {
      title: t('actions'),
      align: 'right',
      render: (row) =>
        row.status === 'draft' &&
        row.deliveryNoteIds.length === 0 && (
          <Can permission="invoices.update">
            <ActionLink href={`/invoices/${row.id}/edit`} label={t('editInvoice')}>
              <Pencil size={16} />
            </ActionLink>
          </Can>
        ),
    },
  ]
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <PageHeader
        eyebrow={t('sales')}
        title={t('invoices')}
        description={t('invoiceDescription')}
        actions={
          <Can permission="invoices.create">
            <Link href="/invoices/new" className={buttonVariants({})}>
              <Plus size={17} />
              {t('newInvoice')}
            </Link>
          </Can>
        }
      />
      <section className="overflow-hidden rounded-panel border border-[var(--border)] bg-[var(--surface)]">
        <DocumentFilters
          filters={filters}
          statuses={statusValues.map((value) => ({ value, label: t(value) }))}
          sorts={sortValues.map((value) => ({
            value,
            label: t(
              value === 'createdAt'
                ? 'newest'
                : value === 'clientName'
                  ? 'client'
                  : value === 'number'
                    ? 'invoice'
                    : value,
            ),
          }))}
          amount
          extra={[
            {
              key: 'source',
              label: t('source'),
              options: [
                { value: '', label: t('allSources') },
                ...sources.map((value) => ({
                  value,
                  label: t(
                    value === 'estimate'
                      ? 'fromEstimate'
                      : value === 'delivery'
                        ? 'fromDelivery'
                        : 'direct',
                  ),
                })),
              ],
            },
            {
              key: 'paymentStatus',
              label: t('paymentStatus'),
              options: [
                { value: '', label: t('allPaymentStatuses') },
                ...paymentStates.map((value) => ({ value, label: t(value) })),
              ],
            },
            {
              key: 'overdue',
              label: t('dueDate'),
              options: [
                { value: '', label: t('allStatuses') },
                { value: 'true', label: t('overdueOnly') },
              ],
            },
          ]}
        />
        {canBulk && (
          <SalesBulkActions
            resource="invoices"
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
            emptyTitle={t('noInvoices')}
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
