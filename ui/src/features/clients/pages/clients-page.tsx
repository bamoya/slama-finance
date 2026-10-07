import { Pencil, Plus, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'wouter'

import { ActionLink } from '../../../components/management/action-link'
import { DataTablePagination } from '../../../components/management/data-table-pagination'
import { DataTableToolbar } from '../../../components/management/data-table-toolbar'
import { PageHeader } from '../../../components/management/page-header'
import { EmptyState } from '../../../components/management/page-state'
import { RequestState } from '../../../components/management/request-state'
import { SelectionCell, SelectionHeader } from '../../../components/management/selection-cell'
import { StatusBadge } from '../../../components/management/status-badge'
import { useTableSelection } from '../../../components/management/use-table-selection'
import { buttonVariants } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Select, SelectOption } from '../../../components/ui/select'
import { translate, useUiLanguage } from '../../../lib/i18n'
import { Can, useAuthorization } from '../../identity'
import { ClientActions } from '../components/client-actions'
import { ClientBulkActions } from '../components/client-bulk-actions'
import { ClientExtraFilters } from '../components/client-extra-filters'
import { ClientSortFilters } from '../components/client-sort-filters'
import { useClients } from '../queries'

export function ClientsPage() {
  useUiLanguage()

  const { t } = useTranslation('clients')
  const [params, setParams] = useSearchParams()
  const { canAll, can } = useAuthorization()
  const canBulk = ['update', 'delete'].some((action) => can(`clients.${action}`))
  const canFinance = canAll(['invoices.read', 'payments.read'])
  const canActivity = canAll([
    'invoices.read',
    'estimates.read',
    'delivery_notes.read',
    'payments.read',
  ])
  const q = params.get('q') ?? ''
  const type = ['individual', 'company'].includes(params.get('type') ?? '')
    ? (params.get('type')! as 'individual' | 'company')
    : 'all'
  const status = ['archived', 'all'].includes(params.get('status') ?? '')
    ? (params.get('status')! as 'archived' | 'all')
    : 'active'
  const requestedPage = Number(params.get('page') ?? 1)
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const limit = [10, 25, 50].includes(Number(params.get('pageSize')))
    ? Number(params.get('pageSize'))
    : 25
  const requestedSort = params.get('sortBy') ?? 'displayName'
  const sortBy =
    requestedSort === 'createdAt'
      ? 'createdAt'
      : canFinance && (requestedSort === 'invoiced' || requestedSort === 'outstanding')
        ? requestedSort
        : canActivity && requestedSort === 'lastActivity'
          ? 'lastActivity'
          : 'displayName'
  const query = useClients({
    q: q || undefined,
    type,
    status,
    limit,
    offset: (page - 1) * limit,
    city: params.get('city') || undefined,
    sortBy,
    sortOrder: params.get('sortOrder') === 'desc' ? 'desc' : 'asc',
    ...(canFinance
      ? {
          balanceMin: params.get('balanceMin') || undefined,
          balanceMax: params.get('balanceMax') || undefined,
          overdueOnly: params.get('overdueOnly') === 'true' ? true : undefined,
        }
      : {}),
    ...(canActivity
      ? {
          lastActivityFrom: params.get('lastActivityFrom') || undefined,
          lastActivityTo: params.get('lastActivityTo') || undefined,
        }
      : {}),
  })
  const selection = useTableSelection(query.data?.items ?? [], params.toString())
  const filter = (key: string, value: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (!value || value === 'all' || (key === 'status' && value === 'active')) next.delete(key)
        else next.set(key, value)
        if (key !== 'page') next.delete('page')
        return next
      },
      { replace: true },
    )
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <PageHeader
        eyebrow={translate('Relationships')}
        title={translate('Clients')}
        description={translate('Manage Moroccan individual and company billing identities.')}
        actions={
          <Can permission="clients.create">
            <Link href="/clients/new" className={buttonVariants({})}>
              <Plus size={17} />
              {translate('Add client')}
            </Link>
          </Can>
        }
      />
      <section className="overflow-hidden rounded-panel border border-[var(--border)] bg-[var(--surface)]">
        <DataTableToolbar
          onReset={
            Array.from(params.keys()).some((key) => key !== 'page')
              ? () => setParams(new URLSearchParams(), { replace: true })
              : undefined
          }
        >
          <label className="table-search grid">
            <span className="sr-only">{translate('Search clients')}</span>
            <div className="relative">
              <Search size={17} className="absolute left-3 top-4" />
              <Input
                aria-label={translate('Search clients')}
                className="pl-10"
                value={q}
                onChange={(event) => filter('q', event.target.value)}
                placeholder={translate('Name, contact, email or identifier')}
              />
            </div>
          </label>
          <label className="table-filter grid">
            <span className="sr-only">{translate('Type')}</span>
            <Select value={type} onValueChange={(value) => filter('type', value)}>
              <SelectOption value="all">{translate('All types')}</SelectOption>
              <SelectOption value="individual">{translate('Individuals')}</SelectOption>
              <SelectOption value="company">{translate('Companies')}</SelectOption>
            </Select>
          </label>
          <label className="table-filter grid">
            <span className="sr-only">{translate('Status')}</span>
            <Select value={status} onValueChange={(value) => filter('status', value)}>
              <SelectOption value="active">{translate('Active')}</SelectOption>
              <SelectOption value="archived">{translate('Archived')}</SelectOption>
              <SelectOption value="all">{translate('All')}</SelectOption>
            </Select>
          </label>
          <ClientSortFilters
            params={params}
            filter={filter}
            currency={query.data?.financialCurrency}
          />
          <ClientExtraFilters
            onDateRange={(from, to) =>
              setParams(
                (current) => {
                  const next = new URLSearchParams(current)
                  for (const [key, value] of [
                    ['lastActivityFrom', from],
                    ['lastActivityTo', to],
                  ] as const) {
                    if (value) next.set(key, value)
                    else next.delete(key)
                  }
                  next.delete('page')
                  return next
                },
                { replace: true },
              )
            }
            params={params}
            filter={filter}
            currency={query.data?.financialCurrency}
          />
        </DataTableToolbar>
        {canBulk && <ClientBulkActions selected={selection.selected} clear={selection.clear} />}
        {query.isPending || query.isError ? (
          <div className="p-5">
            <RequestState query={query} />
          </div>
        ) : query.data.items.length ? (
          <>
            <div className="overflow-x-auto">
              <table data-slot="data-table" className="w-full min-w-[760px] text-left">
                <thead className="bg-[var(--surface-muted)] text-xs uppercase tracking-wide text-[var(--muted)]">
                  <tr>
                    {canBulk && <SelectionHeader selection={selection} />}
                    <th className="px-5 py-3">{translate('Client')}</th>
                    <th className="px-5 py-3">{translate('Type')}</th>
                    <th className="px-5 py-3">{translate('Contact')}</th>
                    <th className="px-5 py-3">{translate('City')}</th>
                    {canFinance && <th className="px-5 py-3">{t('invoiced')}</th>}
                    {canFinance && <th className="px-5 py-3">{t('outstanding')}</th>}
                    {canActivity && <th className="px-5 py-3">{t('lastActivity')}</th>}
                    <th className="px-5 py-3">{translate('Status')}</th>
                    <th className="px-5 py-3 text-right">{translate('Actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {query.data.items.map((client) => (
                    <tr key={client.id} className="hover:bg-[var(--surface-hover)]">
                      {canBulk && (
                        <SelectionCell
                          selection={selection}
                          id={client.id}
                          name={client.displayName}
                        />
                      )}
                      <td className="px-5 py-4">
                        <Link
                          href={`/clients/${client.id}`}
                          className="font-semibold hover:text-[var(--accent)]"
                        >
                          {client.displayName}
                        </Link>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {client.ice
                            ? translate('ICE {{value0}}', { value0: client.ice })
                            : client.tradeName || '—'}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-sm capitalize">{client.type}</td>
                      <td className="px-5 py-4 text-sm">
                        {client.email || client.phone || translate('No contact details')}
                      </td>
                      <td className="px-5 py-4 text-sm">{client.city}</td>
                      {canFinance &&
                        (['invoicedAmount', 'outstandingAmount'] as const).map((key) => (
                          <td key={key} className="px-5 py-4 text-sm tabular-nums">
                            {client.financialSummary?.currencies.length
                              ? client.financialSummary.currencies.map((summary) => (
                                  <p key={summary.currency} className="whitespace-nowrap">
                                    {summary[key]} {summary.currency}
                                  </p>
                                ))
                              : '—'}
                          </td>
                        ))}
                      {canActivity && (
                        <td className="px-5 py-4 text-sm">
                          {client.lastActivityAt?.slice(0, 10) ?? '—'}
                        </td>
                      )}
                      <td className="px-5 py-4">
                        <StatusBadge
                          label={client.archivedAt ? translate('Archived') : translate('Active')}
                          tone={client.archivedAt ? 'archived' : 'active'}
                        />
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <Can permission="clients.update">
                            {!client.archivedAt && (
                              <ActionLink
                                href={`/clients/${client.id}/edit`}
                                label={translate('Edit')}
                              >
                                <Pencil size={16} />
                              </ActionLink>
                            )}
                          </Can>
                          <ClientActions client={client} compact />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="p-5">
            <EmptyState
              title={translate('No clients found')}
              description={translate('Add a client or adjust the filters.')}
            />
          </div>
        )}
        {!query.isPending && !query.isError && (
          <DataTablePagination
            total={query.data.total}
            page={page}
            pageSize={limit}
            onPage={(page) => filter('page', String(page))}
            onPageSizeChange={(size) => filter('pageSize', String(size))}
            disabled={query.isFetching}
          />
        )}
      </section>
    </div>
  )
}
