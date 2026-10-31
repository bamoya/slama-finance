import { useCallback, useState } from 'react'
import { Link } from 'wouter'

import { useListAdminOwners } from '../../../../../api/generated/administration/administration'
import type { AdminOwnerSummary } from '../../../../../api/generated/models'
import { DataTable } from '../../../../../components/management/data-table'
import { DataTablePagination } from '../../../../../components/management/data-table-pagination'
import { DataTableToolbar } from '../../../../../components/management/data-table-toolbar'
import { RequestState } from '../../../../../components/management/request-state'
import { Card } from '../../../../../components/ui/card'
import { displayDateTime } from '../../../../../lib/dates'
import { translate, useUiLanguage } from '../../../../../lib/i18n'
import { planLabel } from '../../../subscriptions/components/billing-format'
import { adminPaths } from '../../shared/admin-paths'
import { AdministrationLayout } from '../../shared/components/administration-layout'
import { AdministrationPageHeader } from '../../shared/components/administration-page-header'
import { SearchField } from '../../shared/components/search-field'
import { SubscriptionStatusBadge } from '../components/subscription-status-badge'

const columns = [
  {
    title: 'Customer',
    render: (customer: AdminOwnerSummary) => (
      <>
        <Link
          href={`${adminPaths.customers}/${customer.id}`}
          className="break-all font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
        >
          {customer.email}
        </Link>
        {customer.name && <p className="text-xs text-[var(--muted)]">{customer.name}</p>}
      </>
    ),
  },
  {
    title: 'Plan',
    render: (customer: AdminOwnerSummary) =>
      customer.planCode ? planLabel(customer.planCode) : '—',
  },
  {
    title: 'Status',
    render: (customer: AdminOwnerSummary) => (
      <SubscriptionStatusBadge status={customer.subscriptionStatus} />
    ),
  },
  {
    title: 'Paid through',
    render: (customer: AdminOwnerSummary) =>
      customer.paidThroughAt ? displayDateTime(customer.paidThroughAt) : '—',
  },
  {
    title: 'Organizations',
    align: 'right' as const,
    render: (customer: AdminOwnerSummary) => customer.organizationCount,
  },
]

export function AdminCustomersPage() {
  useUiLanguage()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const changeSearch = useCallback((value: string) => {
    setSearch(value)
    setPage(1)
  }, [])
  const query = useListAdminOwners(
    { ...(search ? { search } : {}), page },
    { query: { retry: false } },
  )
  return (
    <AdministrationLayout title="Customers">
      <AdministrationPageHeader
        title="Customers"
        description="Find customers and review their subscription and payments."
      />
      <section aria-label={translate('Customers')}>
        <Card className="gap-0 overflow-hidden p-0">
          <DataTableToolbar>
            <div className="table-search flex gap-2" role="search">
              <SearchField
                label="Search customers"
                placeholder="Search by email or name"
                onSearch={changeSearch}
              />
            </div>
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
                emptyTitle={translate('No customers found.')}
                emptyDescription={translate('Try adjusting the search.')}
              />
              <DataTablePagination
                total={query.data.total}
                page={query.data.page}
                pageSize={query.data.pageSize}
                onPage={setPage}
                disabled={query.isFetching}
              />
            </>
          )}
        </Card>
      </section>
    </AdministrationLayout>
  )
}
