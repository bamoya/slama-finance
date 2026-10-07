import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type {
  ReportCriteria,
  ReportSectionRegistry,
} from '../../../api/generated/schemas/reporting/reporting.schemas'
import { DataTableToolbar } from '../../../components/management/data-table-toolbar'
import { Button } from '../../../components/ui/button'
import { Checkbox } from '../../../components/ui/checkbox'
import { Combobox } from '../../../components/ui/combobox'
import { DateRangePicker } from '../../../components/ui/date-range-picker'
import { Select, SelectGroup, SelectOption } from '../../../components/ui/select'
import { TimezoneSelect } from '../../../components/ui/timezone-select'
import { useUiLanguage } from '../../../lib/i18n'
import { useClient, useClients } from '../../clients'
import { Can, useAuthorization } from '../../identity'
import { useCategories, useProducts } from '../../products'

export function ReportFilters({
  filters,
  registry,
  set,
  visual = false,
}: {
  filters: ReportCriteria
  registry: ReportSectionRegistry
  set: (values: Record<string, string | undefined>) => void
  visual?: boolean
}) {
  useUiLanguage()

  const { t } = useTranslation('reports')
  const { can } = useAuthorization()
  const [clientSearch, setClientSearch] = useState('')
  const clients = useClients({ limit: 100, q: clientSearch || undefined }, can('clients.read'))
  const selectedClient = useClient(
    filters.clientId ?? '',
    can('clients.read') && !!filters.clientId,
  )
  const products = useProducts(undefined, can('products.read'))
  const categories = useCategories(undefined, can('categories.read'))
  const selected =
    filters.sections ??
    registry.sections.filter((section) => section.available).map((section) => section.key)
  const activeFilters = (['currency', 'clientId', 'productId', 'categoryId'] as const).filter(
    (key) => filters[key],
  )
  const supports = (key: string) =>
    selected.every((sectionKey) =>
      registry.sections
        .find((section) => section.key === sectionKey)
        ?.supportedFilters.some((filter) => filter === key),
    )
  return (
    <section className="rounded-2xl border border-border bg-[var(--surface)]">
      {!visual && <p className="px-4 pt-4 text-xs text-muted-foreground">{t('filterHint')}</p>}
      <DataTableToolbar separator={!visual}>
        {(!visual || supports('currency')) && (
          <Select
            aria-label={t('currency')}
            className="table-filter"
            aria-describedby={!supports('currency') ? 'report-currency-hint' : undefined}
            disabled={!supports('currency')}
            value={filters.currency ?? ''}
            onValueChange={(value) => set({ currency: value })}
          >
            <SelectGroup>
              <SelectOption value="">{t('allCurrencies')}</SelectOption>
              {['MAD', 'EUR', 'USD'].map((currency) => (
                <SelectOption key={currency} value={currency}>
                  {currency}
                </SelectOption>
              ))}
            </SelectGroup>
          </Select>
        )}
        <Can permission="clients.read">
          <Combobox
            aria-label={t('client')}
            className="table-filter"
            value={filters.clientId ?? ''}
            disabled={!supports('clientId')}
            onValueChange={(value) => set({ clientId: value })}
            options={
              clients.data?.items.map((row) => ({ value: row.id, label: row.displayName })) ?? []
            }
            clearLabel={t('allClients')}
            search={clientSearch}
            onSearchChange={setClientSearch}
            selectedLabel={selectedClient.data?.displayName}
            loading={clients.isPending}
            error={clients.isError}
            onRetry={() => void clients.refetch()}
          />
        </Can>
        <Can permission="products.read">
          {(!visual || supports('productId')) && (
            <Combobox
              aria-label={t('product')}
              className="table-filter"
              value={filters.productId ?? ''}
              disabled={!supports('productId')}
              onValueChange={(value) => set({ productId: value })}
              options={products.data?.map((row) => ({ value: row.id, label: row.name })) ?? []}
              clearLabel={t('allProducts')}
              loading={products.isPending}
              error={products.isError}
              onRetry={() => void products.refetch()}
            />
          )}
        </Can>
        <Can permission="categories.read">
          {(!visual || supports('categoryId')) && (
            <Combobox
              aria-label={t('category')}
              className="table-filter"
              value={filters.categoryId ?? ''}
              disabled={!supports('categoryId')}
              onValueChange={(value) => set({ categoryId: value })}
              options={categories.data?.map((row) => ({ value: row.id, label: row.name })) ?? []}
              clearLabel={t('allCategories')}
              loading={categories.isPending}
              error={categories.isError}
              onRetry={() => void categories.refetch()}
            />
          )}
        </Can>
        <TimezoneSelect
          className="table-filter"
          aria-label={t('timezone')}
          value={filters.timezone ?? 'Africa/Casablanca'}
          onValueChange={(value) => {
            if (value && value !== (filters.timezone ?? 'Africa/Casablanca'))
              set({ timezone: value })
          }}
        />
        <Select
          aria-label={t('bucket')}
          className="table-filter"
          value={filters.bucket ?? 'day'}
          onValueChange={(value) => set({ bucket: value })}
        >
          <SelectGroup>
            {['day', 'week', 'month'].map((value) => (
              <SelectOption key={value} value={value}>
                {t(value)}
              </SelectOption>
            ))}
          </SelectGroup>
        </Select>
        <Select
          aria-label={t('sort')}
          className="table-filter"
          value={filters.sort ?? 'date_desc'}
          onValueChange={(value) => set({ sort: value })}
        >
          <SelectGroup>
            {['date_desc', 'date_asc', 'amount_desc', 'amount_asc', 'name_asc'].map((value) => (
              <SelectOption key={value} value={value}>
                {t(value)}
              </SelectOption>
            ))}
          </SelectGroup>
        </Select>
        {!visual && (
          <Select
            aria-label={t('detail')}
            className="table-filter"
            value={filters.detailSection ?? selected[0] ?? ''}
            onValueChange={(value) => set({ detailSection: value })}
          >
            <SelectGroup>
              {selected.map((value) => (
                <SelectOption key={value} value={value}>
                  {t(`sections.${value}`)}
                </SelectOption>
              ))}
            </SelectGroup>
          </Select>
        )}
        <div className="table-date-range">
          <DateRangePicker
            from={filters.from}
            to={filters.to}
            label={t('dateRange')}
            onChange={(from, to) => set({ from, to })}
          />
        </div>
      </DataTableToolbar>
      {!supports('currency') && (!visual || filters.currency) && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <p id="report-currency-hint" className="text-xs text-muted-foreground">
            {t('currencyUnsupported')}
          </p>
          {filters.currency && (
            <Button variant="outline" onClick={() => set({ currency: undefined })}>
              {t('clearCurrency')}
            </Button>
          )}
        </div>
      )}
      {!visual && (
        <fieldset className="p-4">
          <legend className="px-2 text-sm font-semibold">{t('sectionsTitle')}</legend>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {registry.sections.map((section) => {
              const unsupported = activeFilters.some(
                (key) => !section.supportedFilters.some((filter) => filter === key),
              )
              return (
                <Can key={section.key} permission={'reports.read'}>
                  <label
                    className="flex items-start gap-2 text-sm"
                    title={unsupported ? t('unsupported') : undefined}
                  >
                    <Checkbox
                      checked={selected.includes(section.key)}
                      disabled={
                        !section.available ||
                        (unsupported && !selected.includes(section.key)) ||
                        (selected.length === 1 && selected.includes(section.key))
                      }
                      onCheckedChange={(checked) => {
                        const next = checked
                          ? [...selected, section.key]
                          : selected.filter((key) => key !== section.key)
                        set({
                          sections: next.join(','),
                          detailSection: next.includes(filters.detailSection ?? selected[0]!)
                            ? filters.detailSection
                            : next[0],
                        })
                      }}
                    />
                    <span>
                      {t(`sections.${section.key}`)}
                      {unsupported && (
                        <small className="block text-muted-foreground">{t('unsupported')}</small>
                      )}
                    </span>
                  </label>
                </Can>
              )
            })}
          </div>
        </fieldset>
      )}
    </section>
  )
}
