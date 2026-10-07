import { Pencil, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'wouter'

import type { EstimatePageItemsItem, ListEstimatesParams } from '../../../../api/generated/models'
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
import { useEstimates } from '../queries'

const statusValues = [
  'draft',
  'issued',
  'sent',
  'accepted',
  'rejected',
  'expired',
  'cancelled',
  'superseded',
] as const
const sortValues = [
  'createdAt',
  'issueDate',
  'validUntil',
  'number',
  'clientName',
  'total',
] as const
const allowed = {
  status: ['', ...statusValues],
  sortBy: ['', ...sortValues],
  sortOrder: ['', 'asc', 'desc'],
}

export function EstimatesPage() {
  useUiLanguage()

  const { t } = useTranslation('sales')
  const filters = useDocumentFilters(allowed)
  const { can } = useAuthorization()
  const canBulk = ['read', 'update', 'delete'].some((action) => can(`estimates.${action}`))
  const pageSize = [10, 25, 50].includes(Number(filters.get('pageSize')))
    ? Number(filters.get('pageSize'))
    : 25
  const query = useEstimates({
    search: filters.get('search') || undefined,
    clientId: filters.get('clientId') || undefined,
    status: (filters.get('status') || 'all') as ListEstimatesParams['status'],
    dateFrom: filters.get('dateFrom') || undefined,
    dateTo: filters.get('dateTo') || undefined,
    amountMin: filters.number('amountMin') || undefined,
    amountMax: filters.number('amountMax') || undefined,
    sortBy: (filters.get('sortBy') || 'createdAt') as ListEstimatesParams['sortBy'],
    sortOrder: (filters.get('sortOrder') || 'desc') as ListEstimatesParams['sortOrder'],
    page: filters.page,
    pageSize,
  })
  const selection = useTableSelection(query.data?.items ?? [], filters.scope)
  const columns: DocumentColumn<EstimatePageItemsItem>[] = [
    {
      title: t('estimate'),
      render: (row) => (
        <Link href={`/estimates/${row.id}`} className="font-semibold hover:text-[var(--accent)]">
          {row.number ?? t('draftEstimate')}
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
    { title: t('validUntil'), render: (row) => row.validUntil ?? '—' },
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
      title: t('status'),
      render: (row) => (
        <StatusBadge
          label={t(row.status)}
          tone={
            row.status === 'draft'
              ? 'draft'
              : ['cancelled', 'rejected', 'superseded'].includes(row.status)
                ? 'archived'
                : 'active'
          }
        />
      ),
    },
    {
      title: t('actions'),
      align: 'right',
      render: (row) =>
        row.status === 'draft' && (
          <Can permission="estimates.update">
            <ActionLink href={`/estimates/${row.id}/edit`} label={t('editEstimate')}>
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
        title={t('estimates')}
        description={t('estimateDescription')}
        actions={
          <Can permission="estimates.create">
            <Link href="/estimates/new" className={buttonVariants({})}>
              <Plus size={17} />
              {t('newEstimate')}
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
              value === 'clientName'
                ? 'client'
                : value === 'createdAt'
                  ? 'newest'
                  : value === 'number'
                    ? 'estimate'
                    : value === 'total'
                      ? 'total'
                      : value,
            ),
          }))}
          amount
        />
        {canBulk && (
          <SalesBulkActions
            resource="estimates"
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
            emptyTitle={t('noEstimates')}
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
