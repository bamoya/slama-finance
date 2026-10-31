import { ArrowRight, Building2, Search, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, Redirect } from 'wouter'

import { useListOwnerOrganizations } from '../../../../api/generated/identity/identity'
import type {
  ListOwnerOrganizationsParams,
  OwnerOrganization,
} from '../../../../api/generated/models'
import { DataTablePagination } from '../../../../components/management/data-table-pagination'
import { PageHeader } from '../../../../components/management/page-header'
import { EmptyState } from '../../../../components/management/page-state'
import { RequestState } from '../../../../components/management/request-state'
import { Card } from '../../../../components/ui/card'
import { Input } from '../../../../components/ui/input'
import { Select, SelectGroup, SelectOption } from '../../../../components/ui/select'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { OwnerPortalLayout } from '../../shared/components/owner-portal-layout'
import { OrganizationStatus } from '../components/organization-status'
import { OwnerNewOrganizationButton } from '../components/owner-new-organization-button'
import { organizationStatusLabels } from '../organization-status'

function OrganizationList() {
  useUiLanguage()
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<OwnerOrganization['status'] | ''>('')
  const [page, setPage] = useState(1)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [query])
  const params: ListOwnerOrganizationsParams = {
    page,
    pageSize: 12,
    q: search || undefined,
    status: status || undefined,
  }
  const result = useListOwnerOrganizations(params, { query: { retry: false } })
  if (result.error?.status === 401) return <Redirect to="/login" />
  return (
    <>
      <PageHeader
        brandName="B-Finance"
        eyebrow={translate('Owner portal')}
        title={translate('Your organizations')}
        description={translate('Choose an organization to view its details and access status.')}
        backHref="/"
        actions={<OwnerNewOrganizationButton />}
      />
      <section aria-label={translate('Organizations')}>
        <Card className="gap-0 overflow-hidden p-0">
          <div className="flex flex-wrap gap-3 border-b border-[var(--border)] p-4">
            <div className="relative min-w-48 flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]"
                aria-hidden="true"
              />
              <Input
                aria-label={translate('Search organizations')}
                placeholder={translate('Search organizations')}
                className="pl-9"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Select
              aria-label={translate('Organization status')}
              value={status}
              className="w-full sm:w-52"
              onValueChange={(value) => {
                setStatus(value as typeof status)
                setPage(1)
              }}
            >
              <SelectGroup>
                <SelectOption value="">{translate('All statuses')}</SelectOption>
                {Object.entries(organizationStatusLabels).map(([value, label]) => (
                  <SelectOption key={value} value={value}>
                    {translate(label)}
                  </SelectOption>
                ))}
              </SelectGroup>
            </Select>
          </div>
          {result.isPending || result.error ? (
            <div className="p-4">
              <RequestState query={result} />
            </div>
          ) : result.data?.items.length ? (
            <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
              {result.data.items.map((organization) => (
                <Link
                  key={organization.id}
                  href={`/organizations/${organization.id}${organization.status === 'setup' ? '/setup' : ''}`}
                  className="group rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <span className="rounded-xl bg-[var(--accent-soft)] p-3 text-[var(--accent)]">
                      <Building2 className="size-5" aria-hidden="true" />
                    </span>
                    <OrganizationStatus status={organization.status} />
                  </div>
                  <h3 className="break-words text-lg font-semibold text-[var(--text)]">
                    {organization.name}
                  </h3>
                  <p className="mt-1 break-words text-sm text-[var(--muted)]">
                    {organization.slug}
                  </p>
                  <div className="mt-5 flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 text-[var(--muted)]">
                      <Users className="size-4" aria-hidden="true" />
                      {translate('Members')}: {organization.staffCount}
                    </span>
                    <span className="flex items-center gap-2 text-[var(--accent)]">
                      {organization.status === 'setup' && <span>{translate('Resume setup')}</span>}
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-4">
              <EmptyState
                title={translate('No organizations found')}
                description={translate(
                  'Your owned organizations will appear here. Try adjusting the search or status filter.',
                )}
              />
            </div>
          )}
          {result.data && (
            <DataTablePagination
              total={result.data.total}
              page={page}
              pageSize={12}
              onPage={setPage}
              disabled={result.isFetching}
            />
          )}
        </Card>
      </section>
    </>
  )
}
export function OwnerOrganizationsPage() {
  return (
    <OwnerPortalLayout>
      <OrganizationList />
    </OwnerPortalLayout>
  )
}
