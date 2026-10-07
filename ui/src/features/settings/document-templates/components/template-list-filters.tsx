import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { DataTableToolbar } from '../../../../components/management/data-table-toolbar'
import { Input } from '../../../../components/ui/input'
import { Select, SelectOption } from '../../../../components/ui/select'
import { useUiLanguage } from '../../../../lib/i18n'
import { layoutLabelKey, templateLayouts } from '../utils/design-options'

export function TemplateListFilters({
  search,
  layout,
  density,
  status,
  update,
  reset,
}: {
  search: string
  layout: string
  density: string
  status: string
  update: (key: string, value: string) => void
  reset?: () => void
}) {
  useUiLanguage()

  const { t } = useTranslation('templates')
  return (
    <DataTableToolbar
      aria-label={t('filters')}
      activeCount={[!!layout, !!density, status !== 'active'].filter(Boolean).length}
      onReset={reset}
    >
      <div className="table-search relative">
        <Search aria-hidden="true" className="absolute left-3 top-3 size-4 text-muted-foreground" />
        <Input
          className="pl-9"
          aria-label={t('search')}
          placeholder={t('search')}
          maxLength={200}
          value={search}
          onChange={(e) => update('q', e.target.value)}
        />
      </div>
      <div className="table-filter">
        <Select aria-label={t('layout')} value={layout} onValueChange={(v) => update('design', v)}>
          <SelectOption value="">{t('allDesigns')}</SelectOption>
          {templateLayouts.map((value) => (
            <SelectOption key={value} value={value}>
              {t(layoutLabelKey(value))}
            </SelectOption>
          ))}
        </Select>
      </div>
      <div className="table-filter">
        <Select
          aria-label={t('density')}
          value={density}
          onValueChange={(v) => update('density', v)}
        >
          <SelectOption value="">{t('allDensities')}</SelectOption>
          <SelectOption value="standard">{t('standard')}</SelectOption>
          <SelectOption value="compact">{t('compactDensity')}</SelectOption>
        </Select>
      </div>
      <div className="table-filter">
        <Select aria-label={t('status')} value={status} onValueChange={(v) => update('status', v)}>
          <SelectOption value="active">{t('active')}</SelectOption>
          <SelectOption value="archived">{t('archived')}</SelectOption>
          <SelectOption value="all">{t('allStatuses')}</SelectOption>
        </Select>
      </div>
    </DataTableToolbar>
  )
}
