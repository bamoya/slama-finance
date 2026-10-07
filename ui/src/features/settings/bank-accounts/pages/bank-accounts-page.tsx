import { Eye, Pencil, Plus, Search } from 'lucide-react'
import { Link, useSearchParams } from 'wouter'

import { ActionLink } from '../../../../components/management/action-link'
import { DataTableToolbar } from '../../../../components/management/data-table-toolbar'
import { PageHeader } from '../../../../components/management/page-header'
import { EmptyState } from '../../../../components/management/page-state'
import { RequestState } from '../../../../components/management/request-state'
import { SelectionCell, SelectionHeader } from '../../../../components/management/selection-cell'
import { StatusBadge } from '../../../../components/management/status-badge'
import { useTableSelection } from '../../../../components/management/use-table-selection'
import { buttonVariants } from '../../../../components/ui/button'
import { Combobox } from '../../../../components/ui/combobox'
import { Input } from '../../../../components/ui/input'
import { Select, SelectOption } from '../../../../components/ui/select'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { Can, useAuthorization } from '../../../identity'
import { SettingsBulkActions } from '../../shared/components/settings-bulk-actions'
import { SettingsRecordActions } from '../../shared/components/settings-record-actions'
import { useBankAccounts } from '../../shared/queries'

export function BankAccountsPage() {
  useUiLanguage()

  const { can } = useAuthorization()
  const query = useBankAccounts()

  const [params, setParams] = useSearchParams()
  const search = params.get('q') ?? ''
  const status = ['active', 'archived', 'all'].includes(params.get('status') ?? '')
    ? params.get('status')!
    : 'active'
  const currency = params.get('currency') ?? ''
  const bank = params.get('bank') ?? ''
  const banks = [...new Set((query.data ?? []).map((row) => row.bankName))].sort((a, b) =>
    a.localeCompare(b),
  )
  const normalized = (text: string) =>
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
  const needle = normalized(search)
  const rows = (query.data ?? []).filter(
    (row) =>
      (status === 'all' || (status === 'archived' ? !!row.archivedAt : !row.archivedAt)) &&
      (!currency || row.currency === currency) &&
      (!bank || row.bankName === bank) &&
      (!needle ||
        [row.name, row.bankName, row.accountHolder, row.rib ?? '', row.iban ?? ''].some((text) =>
          normalized(text).includes(needle),
        ) ||
        [row.rib, row.iban].some(
          (text) => text && normalized(text).includes(needle.replace(/\s/g, '')),
        )),
  )
  const updateFilter = (name: string, value: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (!value || (name === 'status' && value === 'active')) next.delete(name)
        else next.set(name, value)
        return next
      },
      { replace: true },
    )
  const suffix = params.size ? `?${params.toString()}` : ''
  const selection = useTableSelection(rows, params.toString())
  const canBulk = ['update', 'delete'].some((action) => can(`bank_accounts.${action}`))
  const selectClass =
    'h-control rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm'
  const filtered = !!search || status !== 'active' || !!currency || !!bank
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <PageHeader
        eyebrow={translate('Administration')}
        title={translate('Bank accounts')}
        description={translate(
          'Manage payment destinations. Archived accounts remain available to historical documents.',
        )}
        actions={
          <Can permission="bank_accounts.create">
            <Link href={`/settings/bank-accounts/new${suffix}`} className={buttonVariants({})}>
              <Plus size={16} aria-hidden="true" />
              {translate('Add bank account')}
            </Link>
          </Can>
        }
      />

      <section
        aria-label={translate('Bank accounts table')}
        className="overflow-hidden rounded-panel border border-[var(--border)] bg-[var(--surface)]"
      >
        <DataTableToolbar
          activeCount={[status !== 'active', !!currency, !!bank].filter(Boolean).length}
          aria-label={translate('Bank account filters')}
          onReset={filtered ? () => setParams(new URLSearchParams(), { replace: true }) : undefined}
        >
          <label className="table-search grid">
            <span className="sr-only">{translate('Search accounts')}</span>
            <div className="relative">
              <Search size={17} aria-hidden="true" className="absolute left-3 top-4" />
              <Input
                aria-label={translate('Search bank accounts')}
                className="pl-10"
                placeholder={translate('Label, bank, holder, RIB or IBAN')}
                maxLength={200}
                value={search}
                onChange={(e) => updateFilter('q', e.target.value)}
              />
            </div>
          </label>
          <label className="table-filter grid">
            <span className="sr-only">{translate('Status')}</span>
            <Select
              className={selectClass}
              value={status}
              onValueChange={(value) => updateFilter('status', value)}
            >
              <SelectOption value="active">{translate('Active')}</SelectOption>
              <SelectOption value="archived">{translate('Archived')}</SelectOption>
              <SelectOption value="all">{translate('All accounts')}</SelectOption>
            </Select>
          </label>
          <label className="table-filter grid">
            <span className="sr-only">{translate('Currency')}</span>
            <Select
              className={selectClass}
              value={currency}
              onValueChange={(value) => updateFilter('currency', value)}
            >
              <SelectOption value="">{translate('All currencies')}</SelectOption>
              {['MAD', 'EUR', 'USD'].map((value) => (
                <SelectOption key={value}>{value}</SelectOption>
              ))}
            </Select>
          </label>
          <label className="table-filter grid">
            <span className="sr-only">{translate('Bank')}</span>
            <Combobox
              value={bank}
              onValueChange={(value) => updateFilter('bank', value)}
              options={banks.map((value) => ({ value, label: value }))}
              placeholder={translate('All banks')}
              clearLabel={translate('All banks')}
              selectedLabel={bank && !banks.includes(bank) ? `${bank} (unavailable)` : undefined}
              aria-label={translate('Bank')}
              loading={query.isPending}
              error={query.isError}
              onRetry={() => void query.refetch()}
            />
          </label>
        </DataTableToolbar>
        {canBulk && (
          <SettingsBulkActions
            resource="bank"
            selected={selection.selected}
            clear={selection.clear}
          />
        )}
        {query.isPending || query.isError ? (
          <RequestState query={query} />
        ) : (
          <div className="overflow-x-auto p-5">
            <p role="status" className="mb-3 text-sm text-[var(--muted)]">
              {rows.length} {translate('of')} {query.data.length} {translate('accounts')}
            </p>
            {!rows.length ? (
              <EmptyState
                title={
                  query.data.length
                    ? translate('No matching accounts')
                    : translate('No bank accounts yet')
                }
                description={
                  query.data.length
                    ? translate('Try another search or clear your filters.')
                    : translate('Add a bank account to configure your payment destinations.')
                }
              />
            ) : (
              <table data-slot="data-table" className="w-full text-left text-sm">
                <thead>
                  <tr>
                    {canBulk && <SelectionHeader selection={selection} />}
                    {['Account', 'Bank / holder', 'Currency', 'Status', 'Actions'].map((title) => (
                      <th key={title} className="p-3">
                        {title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-[var(--border)]">
                      {canBulk && (
                        <SelectionCell selection={selection} id={row.id} name={row.name} />
                      )}
                      <td className="p-3">
                        <Link
                          href={`/settings/bank-accounts/${row.id}${suffix}`}
                          className="font-semibold hover:underline"
                        >
                          {row.name}
                        </Link>
                        <p className="mt-1 text-xs text-[var(--muted)]">{row.rib || row.iban}</p>
                      </td>
                      <td className="p-3">
                        {row.bankName}
                        <p className="text-xs text-[var(--muted)]">{row.accountHolder}</p>
                      </td>
                      <td className="p-3">{row.currency}</td>
                      <td className="p-3">
                        <StatusBadge
                          label={row.archivedAt ? translate('Archived') : translate('Active')}
                          tone={row.archivedAt ? 'archived' : 'active'}
                        />
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          <ActionLink
                            href={`/settings/bank-accounts/${row.id}${suffix}`}
                            label={translate('View')}
                          >
                            <Eye size={16} aria-hidden="true" />
                          </ActionLink>

                          <Can permission="bank_accounts.update">
                            {!row.archivedAt && (
                              <>
                                <ActionLink
                                  href={`/settings/bank-accounts/${row.id}/edit${suffix}`}
                                  label={translate('Edit')}
                                >
                                  <Pencil size={16} aria-hidden="true" />
                                </ActionLink>
                              </>
                            )}
                          </Can>

                          <SettingsRecordActions resource="bank" record={row} compact />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
