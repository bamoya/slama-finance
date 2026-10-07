import { useTranslation } from 'react-i18next'

import { DataTableToolbar } from '../../../components/management/data-table-toolbar'
import { DateRangePicker } from '../../../components/ui/date-range-picker'
import { Input } from '../../../components/ui/input'
import { Select, SelectGroup, SelectOption } from '../../../components/ui/select'
import { useUiLanguage } from '../../../lib/i18n'
import type { ActivityFilters } from './activity-tree-model'
import { type RecordSection, recordStatusFilters } from './record-status-filters'

export function ClientRecordFilters({
  filters,
  onChange,
  sections,
}: {
  filters: ActivityFilters
  sections: RecordSection[]
  onChange: (changes: Partial<ActivityFilters>) => void
}) {
  useUiLanguage()

  const { t } = useTranslation('clients')
  return (
    <DataTableToolbar
      activeCount={
        Object.entries(filters).filter(([key, value]) => key !== 'search' && !!value).length
      }
      onReset={
        Object.values(filters).some(Boolean)
          ? () =>
              onChange({
                search: '',
                estimateStatus: '',
                invoiceStatus: '',
                paymentStatus: '',
                deliveryStatus: '',
                from: '',
                to: '',
              })
          : undefined
      }
    >
      <div className="table-search">
        <Input
          value={filters.search}
          onChange={(event) => onChange({ search: event.target.value })}
          placeholder={t('searchRecords')}
          aria-label={t('searchRecords')}
          maxLength={100}
        />
      </div>
      {recordStatusFilters
        .filter((filter) => sections.includes(filter.section))
        .map((filter) => (
          <div key={filter.key} className="table-filter min-w-52">
            <Select
              value={filters[filter.key] ?? ''}
              onValueChange={(value) => onChange({ [filter.key]: value })}
              aria-label={t(filter.key)}
            >
              <SelectGroup>
                <SelectOption value="">{t(filter.key)}</SelectOption>
                {filter.options.map((status) => (
                  <SelectOption key={status} value={status}>
                    {t(`statuses.${status}`)}
                  </SelectOption>
                ))}
              </SelectGroup>
            </Select>
          </div>
        ))}
      <div className="table-date-range">
        <DateRangePicker
          from={filters.from}
          to={filters.to}
          onChange={(from, to) => onChange({ from, to })}
          label={t('activityRange')}
        />
      </div>
    </DataTableToolbar>
  )
}
