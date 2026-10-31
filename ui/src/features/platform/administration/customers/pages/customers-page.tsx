import { useCallback } from 'react'
import { Link } from 'wouter'

import { useListAdminOwners } from '../../../../../api/generated/administration/administration'
import type { AdminOwnerSummary } from '../../../../../api/generated/models'
import { DataTable } from '../../../../../components/management/data-table'
import { DataTablePagination } from '../../../../../components/management/data-table-pagination'
import { DataTableToolbar } from '../../../../../components/management/data-table-toolbar'
import { RequestState } from '../../../../../components/management/request-state'
import { Card } from '../../../../../components/ui/card'
import { Select, SelectGroup, SelectOption } from '../../../../../components/ui/select'
import { displayDateTime } from '../../../../../lib/dates'
import { translate, useUiLanguage } from '../../../../../lib/i18n'
import { planLabel } from '../../../subscriptions/components/billing-format'
import { adminPaths } from '../../shared/admin-paths'
import { AdministrationLayout } from '../../shared/components/administration-layout'
import { AdministrationPageHeader } from '../../shared/components/administration-page-header'
import { SearchField } from '../../shared/components/search-field'
import { useUrlFilters } from '../../shared/hooks/use-url-filters'
import { customerStatusFilters, subscriptionStatusLabel } from '../components/subscription-labels'
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
  const { values, change } = useUrlFilters(['search', 'status', 'page'])
  const search = values.search
  const status = customerStatusFilters.find((item) => item === values.status)
  const page = Math.max(1, Number.parseInt(values.page, 10) || 1)
  const changeSearch = useCallback((value: string) => change({ search: value }), [change])
  const query = useListAdminOwners(
    { ...(search ? { search } : {}), ...(status ? { status } : {}), page },
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
          <DataTableToolbar
            activeCount={(status ? 1 : 0) + (search ? 1 : 0)}
            onReset={status || search ? () => change({ search: '', status: '' }) : undefined}
          >
            <SearchField
              key={search}
              label="Search customers"
              placeholder="Search by email or name"
              onSearch={changeSearch}
              initialValue={search}
            />
            <label className="table-filter grid min-w-56">
              <span className="sr-only">{translate('Customer status')}</span>
              <Select
                aria-label={translate('Customer status')}
                value={status ?? ''}
                onValueChange={(value) => change({ status: value })}
              >
                <SelectGroup>
                  <SelectOption value="">{translate('All statuses')}</SelectOption>
                  {customerStatusFilters.map((item) => (
                    <SelectOption key={item} value={item}>
                      {subscriptionStatusLabel(item)}
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
                emptyTitle={translate('No customers found.')}
                emptyDescription={translate('Try adjusting the search.')}
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
    </AdministrationLayout>
  )
}
