import { Pencil, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'wouter'

import type {
  DeliveryNotePageItemsItem,
  ListDeliveryNotesParams,
} from '../../../../api/generated/models'
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
import { useDeliveryNotes } from '../queries'

const statusValues = ['draft', 'prepared', 'delivered', 'acknowledged', 'cancelled'] as const
const sortValues = ['createdAt', 'deliveryDate', 'number', 'clientName'] as const
const billingValues = ['billed', 'unbilled'] as const
const allowed = {
  status: ['', ...statusValues],
  sortBy: ['', ...sortValues],
  sortOrder: ['', 'asc', 'desc'],
  billingStatus: ['', ...billingValues],
}

export function DeliveryNotesPage() {
  useUiLanguage()

  const { t } = useTranslation('sales')
  const filters = useDocumentFilters(allowed)
  const { can } = useAuthorization()
  const canBulk = ['read', 'update', 'delete'].some((action) => can(`delivery_notes.${action}`))
  const pageSize = [10, 25, 50].includes(Number(filters.get('pageSize')))
    ? Number(filters.get('pageSize'))
    : 25
  const query = useDeliveryNotes({
    search: filters.get('search') || undefined,
    clientId: filters.get('clientId') || undefined,
    status: (filters.get('status') || 'all') as ListDeliveryNotesParams['status'],
    dateFrom: filters.get('dateFrom') || undefined,
    dateTo: filters.get('dateTo') || undefined,
    billingStatus: (filters.get('billingStatus') ||
      'all') as ListDeliveryNotesParams['billingStatus'],
    sortBy: (filters.get('sortBy') || 'createdAt') as ListDeliveryNotesParams['sortBy'],
    sortOrder: (filters.get('sortOrder') || 'desc') as ListDeliveryNotesParams['sortOrder'],
    page: filters.page,
    pageSize,
  })
  const selection = useTableSelection(query.data?.items ?? [], filters.scope)
  const columns: DocumentColumn<DeliveryNotePageItemsItem>[] = [
    {
      title: t('delivery'),
      render: (row) => (
        <Link
          href={`/delivery-notes/${row.id}`}
          className="font-semibold hover:text-[var(--accent)]"
        >
          {row.number ?? t('draftDelivery')}
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
    { title: t('deliveryDate'), render: (row) => row.deliveryDate },
    {
      title: t('relatedInvoice'),
      render: (row) =>
        row.invoiceId ? (
          <Can
            permission="invoices.read"
            fallback={<span>{row.invoiceNumber ?? t('invoice')}</span>}
          >
            <Link href={`/invoices/${row.invoiceId}`} className="hover:text-[var(--accent)]">
              {row.invoiceNumber ?? t('viewInvoice')}
            </Link>
          </Can>
        ) : (
          '—'
        ),
    },
    { title: t('products'), render: (row) => row.lines.length, align: 'right' },
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
        row.status === 'draft' && (
          <Can permission="delivery_notes.update">
            <ActionLink href={`/delivery-notes/${row.id}/edit`} label={t('editDelivery')}>
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
        title={t('deliveries')}
        description={t('deliveryDescription')}
        actions={
          <Can permission="delivery_notes.create">
            <Link href="/delivery-notes/new" className={buttonVariants({})}>
              <Plus size={17} />
              {t('newDelivery')}
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
                    ? 'delivery'
                    : value,
            ),
          }))}
          extra={[
            {
              key: 'billingStatus',
              label: t('billing'),
              options: [
                { value: '', label: t('allBilling') },
                ...billingValues.map((value) => ({ value, label: t(value) })),
              ],
            },
          ]}
        />
        {canBulk && (
          <SalesBulkActions
            resource="delivery_notes"
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
            emptyTitle={t('noDeliveries')}
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
