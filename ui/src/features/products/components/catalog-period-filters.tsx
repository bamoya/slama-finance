import { useTranslation } from 'react-i18next'

import { DataTableToolbar } from '../../../components/management/data-table-toolbar'
import { DateRangePicker } from '../../../components/ui/date-range-picker'
import { Select, SelectOption } from '../../../components/ui/select'
import { useUiLanguage } from '../../../lib/i18n'
import type { CatalogContext } from './catalog-period'

export function CatalogPeriodFilters({
  context,
  resolvedCurrency,
  onChange,
  onRangeChange,
}: {
  context: CatalogContext
  resolvedCurrency: string
  onChange: (key: 'period' | 'currency' | 'from' | 'to', value: string) => void
  onRangeChange: (from: string, to: string) => void
}) {
  useUiLanguage()

  const { t } = useTranslation('catalog')
  const currency = context.currency || resolvedCurrency
  return (
    <DataTableToolbar
      aria-label={t('period')}
      activeCount={context.period !== 'month' ? 1 : 0}
      className="rounded-2xl border border-border bg-[var(--surface)]"
    >
      <label className="grid content-start gap-1 text-sm">
        <span>{t('period')}</span>
        <Select value={context.period} onValueChange={(value) => onChange('period', value)}>
          <SelectOption value="month">{t('thisMonth')}</SelectOption>
          <SelectOption value="lastmonth">{t('lastMonth')}</SelectOption>
          <SelectOption value="year">{t('thisYear')}</SelectOption>
          <SelectOption value="all">{t('allTime')}</SelectOption>
          <SelectOption value="custom">{t('customPeriod')}</SelectOption>
        </Select>
      </label>
      <label className="grid content-start gap-1 text-sm">
        <span>{t('currency')}</span>
        <Select value={currency} onValueChange={(value) => onChange('currency', value)}>
          {[...new Set([currency, 'MAD', 'EUR', 'USD'])].map((code) => (
            <SelectOption key={code} value={code}>
              {code}
            </SelectOption>
          ))}
        </Select>
      </label>
      {context.period === 'custom' && (
        <div className="grid content-end sm:col-span-2">
          <DateRangePicker from={context.from} to={context.to} onChange={onRangeChange} />
        </div>
      )}
    </DataTableToolbar>
  )
}
