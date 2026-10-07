import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { DataTableToolbar } from '../../../components/management/data-table-toolbar'
import { DateRangePicker } from '../../../components/ui/date-range-picker'
import { Input } from '../../../components/ui/input'
import { Select, SelectOption } from '../../../components/ui/select'
import { useUiLanguage } from '../../../lib/i18n'
import { useAuthorization } from '../../identity'
import { ClientPicker } from './client-picker'
import type { FilterOption } from './use-document-filters'

type Props = {
  filters: {
    get: (key: string) => string
    number: (key: string) => string
    set: (key: string, value: string) => void
    setMany: (values: Record<string, string>) => void
    reset: () => void
    active: boolean
  }
  statuses: readonly FilterOption[]
  sorts: readonly FilterOption[]
  extra?: readonly { key: string; label: string; options: readonly FilterOption[] }[]
  amount?: boolean
  sortKey?: string
  showOrder?: boolean
}

export function DocumentFilters({
  filters,
  statuses,
  sorts,
  extra = [],
  amount = false,
  sortKey = 'sortBy',
  showOrder = true,
}: Props) {
  useUiLanguage()

  const { t } = useTranslation('sales')
  const { can } = useAuthorization()
  return (
    <DataTableToolbar
      activeCount={
        [
          'clientId',
          'status',
          'amountMin',
          'amountMax',
          'dateFrom',
          'dateTo',
          ...extra.map((field) => field.key),
        ].filter((key) => !!filters.get(key) && filters.get(key) !== 'all').length
      }
      onReset={filters.active ? filters.reset : undefined}
    >
      <label className="table-search grid">
        <span className="sr-only">{t('search')}</span>
        <span className="relative">
          <Search
            size={17}
            className="absolute left-3 top-1/2 text-[var(--muted)]"
            aria-hidden="true"
          />
          <Input
            className="pl-10"
            placeholder={t('search')}
            value={filters.get('search')}
            onChange={(event) => filters.set('search', event.target.value)}
            type="search"
          />
        </span>
      </label>
      <div className="table-filter grid">
        <span className="sr-only">{t('client')}</span>
        <ClientPicker
          value={filters.get('clientId')}
          onValueChange={(value) => filters.set('clientId', value)}
          activeOnly={false}
          enabled={can('clients.read')}
          clearLabel={t('allClients')}
        />
      </div>
      <label className="table-filter grid">
        <span className="sr-only">{t('status')}</span>
        <Select
          value={filters.get('status')}
          onValueChange={(value) => filters.set('status', value)}
        >
          <SelectOption value="">{t('allStatuses')}</SelectOption>
          {statuses.map((option) => (
            <SelectOption key={option.value} value={option.value}>
              {option.label}
            </SelectOption>
          ))}
        </Select>
      </label>
      <label className="table-filter grid">
        <span className="sr-only">{t('sort')}</span>
        <Select value={filters.get(sortKey)} onValueChange={(value) => filters.set(sortKey, value)}>
          <SelectOption value="">{t('newest')}</SelectOption>
          {sorts.map((option) => (
            <SelectOption key={option.value} value={option.value}>
              {option.label}
            </SelectOption>
          ))}
        </Select>
      </label>

      {extra.length > 0 && (
        <>
          {extra.map((field) => (
            <label key={field.key} className="table-filter grid">
              <span className="sr-only">{field.label}</span>
              <Select
                value={filters.get(field.key)}
                onValueChange={(value) => filters.set(field.key, value)}
              >
                {field.options.map((option) => (
                  <SelectOption key={option.value} value={option.value}>
                    {option.label}
                  </SelectOption>
                ))}
              </Select>
            </label>
          ))}
        </>
      )}
      {showOrder && (
        <label className="table-filter grid">
          <span className="sr-only">{t('order')}</span>
          <Select
            value={filters.get('sortOrder') || 'desc'}
            onValueChange={(value) => filters.set('sortOrder', value)}
          >
            <SelectOption value="desc">{t('descending')}</SelectOption>
            <SelectOption value="asc">{t('ascending')}</SelectOption>
          </Select>
        </label>
      )}
      {amount &&
        ['amountMin', 'amountMax'].map((key) => (
          <label key={key} className="table-filter grid">
            <span className="sr-only">{t(key)}</span>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder={t(key)}
              value={filters.number(key)}
              onChange={(event) => filters.set(key, event.target.value)}
            />
          </label>
        ))}
      <div className="table-date-range">
        <DateRangePicker
          from={filters.get('dateFrom')}
          to={filters.get('dateTo')}
          onChange={(from, to) => filters.setMany({ dateFrom: from, dateTo: to })}
        />
      </div>
    </DataTableToolbar>
  )
}
