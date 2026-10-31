import { useState } from 'react'
import { Link } from 'wouter'

import { useListAdminOwners } from '../../../../../api/generated/administration/administration'
import { DataTablePagination } from '../../../../../components/management/data-table-pagination'
import { RequestState } from '../../../../../components/management/request-state'
import { Input } from '../../../../../components/ui/input'
import { displayDateTime } from '../../../../../lib/dates'
import { translate, useUiLanguage } from '../../../../../lib/i18n'
import { planLabel } from '../../../subscriptions/components/billing-format'
import { adminPaths } from '../../shared/admin-paths'
import { AdministrationLayout } from '../../shared/components/administration-layout'
import { ScrollingTable } from '../../shared/components/scrolling-table'
import { subscriptionStatusLabel } from '../components/subscription-labels'

export function AdminCustomersPage() {
  useUiLanguage()
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const query = useListAdminOwners(
    { ...(search ? { search } : {}), page },
    { query: { retry: false } },
  )
  return (
    <AdministrationLayout title="Customers">
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault()
          setSearch(draft.trim())
          setPage(1)
        }}
      >
        <Input
          type="search"
          aria-label={translate('Search customers')}
          placeholder={translate('Search by email or name')}
          value={draft}
          maxLength={120}
          onChange={(event) => setDraft(event.target.value)}
          className="max-w-md"
        />
      </form>
      {query.isPending || query.isError ? (
        <RequestState query={query} />
      ) : (
        <section aria-label={translate('Customers')} className="space-y-4">
          <ScrollingTable>
            <thead>
              <tr>
                <th>{translate('Owner')}</th>
                <th>{translate('Plan')}</th>
                <th>{translate('Status')}</th>
                <th>{translate('Paid through')}</th>
                <th className="text-right">{translate('Organizations')}</th>
              </tr>
            </thead>
            <tbody>
              {!query.data.items.length && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-[var(--muted)]">
                    {translate('No customers found.')}
                  </td>
                </tr>
              )}
              {query.data.items.map((owner) => (
                <tr key={owner.id} className="border-t border-[var(--border)]">
                  <td>
                    <Link
                      href={`${adminPaths.customers}/${owner.id}`}
                      className="break-all font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
                    >
                      {owner.email}
                    </Link>
                    {owner.name && <p className="text-xs text-[var(--muted)]">{owner.name}</p>}
                  </td>
                  <td>{owner.planCode ? planLabel(owner.planCode) : '—'}</td>
                  <td>{subscriptionStatusLabel(owner.subscriptionStatus)}</td>
                  <td className="whitespace-nowrap">
                    {owner.paidThroughAt ? displayDateTime(owner.paidThroughAt) : '—'}
                  </td>
                  <td className="text-right">{owner.organizationCount}</td>
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
    </AdministrationLayout>
  )
}
