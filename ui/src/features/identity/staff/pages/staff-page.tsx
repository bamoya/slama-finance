import { Eye, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'wouter'

import {
  type ListStaffQuery,
  listStaffQuerySchema,
} from '../../../../api/generated/schemas/identity/staff.schemas'
import { ActionLink } from '../../../../components/management/action-link'
import { DataTablePagination } from '../../../../components/management/data-table-pagination'
import { DataTableToolbar } from '../../../../components/management/data-table-toolbar'
import { PageHeader } from '../../../../components/management/page-header'
import { EmptyState } from '../../../../components/management/page-state'
import { RequestState } from '../../../../components/management/request-state'
import { SelectionCell, SelectionHeader } from '../../../../components/management/selection-cell'
import { StatusBadge } from '../../../../components/management/status-badge'
import { useTableSelection } from '../../../../components/management/use-table-selection'
import { Button, buttonVariants } from '../../../../components/ui/button'
import { Combobox } from '../../../../components/ui/combobox'
import { Input } from '../../../../components/ui/input'
import { Select, SelectOption } from '../../../../components/ui/select'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { Can } from '../../auth/components/can'
import { useAuthorization } from '../../auth/hooks/use-authorization'
import { useRoles, useStaffList } from '../../shared/queries'
import { StaffBulkActions } from '../components/staff-bulk-actions'
export function StaffPage() {
  useUiLanguage()

  const { can: hasAccess } = useAuthorization()

  const canReadRoles = hasAccess('roles.read') ?? false
  const roles = useRoles(canReadRoles)
  const [query, setQuery] = useState<ListStaffQuery>(() => listStaffQuerySchema.parse({}))
  const [search, setSearch] = useState('')
  const staff = useStaffList(query)
  const selection = useTableSelection(staff.data?.items ?? [], JSON.stringify(query))
  const canBulk = hasAccess('staff.update')
  const selectClass =
    'h-control rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm'
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <PageHeader
        eyebrow={translate('Administration')}
        title={translate('Staff')}
        description={translate(
          'Manage company accounts, role assignments and access. No public registration.',
        )}
        actions={
          <Can permission="staff.create">
            <Link href="/settings/staff/new" className={buttonVariants({})}>
              <Plus size={17} />
              {translate('Add staff member')}
            </Link>
          </Can>
        }
      />
      <section className="overflow-hidden rounded-panel border border-[var(--border)] bg-[var(--surface)]">
        <DataTableToolbar
          activeCount={
            [
              !!query.roleId,
              query.status !== 'current',
              query.sort !== 'email',
              query.direction !== 'asc',
            ].filter(Boolean).length
          }
          onReset={() => {
            setSearch('')
            setQuery(listStaffQuerySchema.parse({}))
          }}
        >
          <form
            className="table-search flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              setQuery({ ...query, q: search.trim() || undefined, page: 1 })
            }}
          >
            <Input
              aria-label={translate('Search staff')}
              placeholder={translate('Search name or email')}
              value={search}
              maxLength={200}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button variant="outline" type="submit" aria-label={translate('Search')}>
              <Search size={18} />
            </Button>
          </form>
          <label className="table-filter grid">
            <span className="sr-only">{translate('Role')}</span>
            <Combobox
              value={query.roleId ?? ''}
              disabled={!canReadRoles}
              onValueChange={(value) =>
                setQuery(
                  listStaffQuerySchema.parse({
                    ...query,
                    roleId: value || undefined,
                    page: 1,
                  }),
                )
              }
              options={(roles.data ?? []).map((role) => ({ value: role.id, label: role.name }))}
              placeholder={translate('All roles')}
              clearLabel={translate('All roles')}
              selectedLabel={
                query.roleId && roles.data && !roles.data.some((role) => role.id === query.roleId)
                  ? translate('Deleted role — clear filter')
                  : undefined
              }
              aria-label={translate('Role')}
              loading={roles.isPending && canReadRoles}
              error={roles.isError && canReadRoles}
              onRetry={() => void roles.refetch()}
            />
          </label>
          <label className="table-filter grid">
            <span className="sr-only">{translate('Accounts')}</span>
            <Select
              className={selectClass}
              value={query.status}
              onValueChange={(value) =>
                setQuery(listStaffQuerySchema.parse({ ...query, status: value, page: 1 }))
              }
            >
              <SelectOption value="current">{translate('Current accounts')}</SelectOption>
              <SelectOption value="archived">{translate('Archived')}</SelectOption>
              <SelectOption value="all">{translate('All accounts')}</SelectOption>
            </Select>
          </label>
          <label className="table-filter grid">
            <span className="sr-only">{translate('Sort by')}</span>
            <Select
              className={selectClass}
              value={query.sort}
              onValueChange={(value) =>
                setQuery(listStaffQuerySchema.parse({ ...query, sort: value, page: 1 }))
              }
            >
              <SelectOption value="email">{translate('Email')}</SelectOption>
              <SelectOption value="firstName">{translate('First name')}</SelectOption>
              <SelectOption value="lastName">{translate('Family name')}</SelectOption>
            </Select>
          </label>
          <Button
            variant="outline"

            onClick={() =>
              setQuery({ ...query, direction: query.direction === 'asc' ? 'desc' : 'asc', page: 1 })
            }
          >
            {query.direction === 'asc' ? translate('Ascending') : translate('Descending')}
          </Button>
        </DataTableToolbar>
        {!canReadRoles && (
          <p className="px-5 py-3 text-xs text-[var(--muted)]">
            {translate('Role filtering requires access to the role catalog (roles.read).')}
          </p>
        )}
        {canReadRoles && roles.isError && (
          <div className="px-5 py-3">
            <p role="alert" className="text-sm text-[var(--muted)]">
              {translate('Could not load role filters. The staff list is still available.')}
            </p>
            <Button variant="outline" className="mt-2" onClick={() => void roles.refetch()}>
              {translate('Retry role filters')}
            </Button>
          </div>
        )}
        {canBulk && <StaffBulkActions selected={selection.selected} clear={selection.clear} />}
        {staff.isPending || staff.isError ? (
          <div className="p-5">
            <RequestState query={staff} />
          </div>
        ) : !staff.data.items.length ? (
          <EmptyState
            title={translate('No staff found')}
            description={translate('Try another search or account filter.')}
          />
        ) : (
          <div className="overflow-x-auto">
            <table data-slot="data-table" className="w-full text-left text-sm">
              <thead className="bg-[var(--surface-muted)] text-xs uppercase text-[var(--muted)]">
                <tr>
                  {canBulk && <SelectionHeader selection={selection} />}
                  <th className="p-5">{translate('Staff member')}</th>
                  <th className="p-5">{translate('Email')}</th>
                  <th className="p-5">{translate('Status')}</th>
                  <th className="p-5">
                    <span className="sr-only">{translate('Actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {staff.data.items.map((person) => (
                  <tr key={person.id}>
                    {canBulk && (
                      <SelectionCell selection={selection} id={person.id} name={person.email} />
                    )}
                    <td className="p-5 font-semibold">
                      <Link
                        href={`/settings/staff/${person.id}`}
                        className="rounded-md hover:underline focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                      >
                        {[person.firstName, person.lastName].filter(Boolean).join(' ') ||
                          translate('Unnamed account')}
                      </Link>
                    </td>
                    <td className="p-5">{person.email}</td>
                    <td className="p-5">
                      <StatusBadge
                        label={
                          person.archivedAt
                            ? translate('Archived')
                            : person.disabledAt
                              ? translate('Disabled')
                              : translate('Active')
                        }
                        tone={person.archivedAt || person.disabledAt ? 'archived' : 'active'}
                      />
                    </td>
                    <td className="p-5">
                      <ActionLink
                        href={`/settings/staff/${person.id}`}
                        label={translate('View {{value0}}', { value0: person.email })}
                      >
                        <Eye size={16} aria-hidden="true" />
                      </ActionLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <DataTablePagination
          total={staff.data?.total ?? 0}
          page={query.page}
          pageSize={query.pageSize}
          disabled={staff.isFetching || !staff.data}
          onPage={(page) => setQuery({ ...query, page })}
          onPageSizeChange={(pageSize) => setQuery({ ...query, pageSize, page: 1 })}
        />
      </section>
    </div>
  )
}
