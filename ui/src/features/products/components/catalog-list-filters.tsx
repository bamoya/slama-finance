import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { Category } from '../../../api/generated/models'
import { DataTableToolbar } from '../../../components/management/data-table-toolbar'
import { Combobox } from '../../../components/ui/combobox'
import { Input } from '../../../components/ui/input'
import { Select, SelectOption } from '../../../components/ui/select'
import { useUiLanguage } from '../../../lib/i18n'

export function CatalogListFilters({
  kind,
  q,
  status,
  category,
  categories = [],
  categoriesLoading = false,
  categoriesError = false,
  onCategoriesRetry,
  sortBy,
  sortOrder,
  showFinancial,
  onChange,
  onReset,
}: {
  kind: 'products' | 'categories'
  q: string
  status: string
  category?: string
  categories?: Pick<Category, 'id' | 'name'>[]
  categoriesLoading?: boolean
  categoriesError?: boolean
  onCategoriesRetry?: () => void
  sortBy: string
  sortOrder: string
  showFinancial: boolean
  onChange: (key: string, value: string) => void
  onReset: () => void
}) {
  useUiLanguage()

  const { t } = useTranslation('catalog')
  const sorts =
    kind === 'products'
      ? [
          { value: 'name', label: t('sortName') },
          { value: 'reference', label: t('sortReference') },
          ...(showFinancial
            ? [
                { value: 'units', label: t('sortUnits') },
                { value: 'weight', label: t('sortWeight') },
                { value: 'revenue', label: t('sortRevenue') },
              ]
            : []),
        ]
      : [
          { value: 'name', label: t('sortName') },
          { value: 'productCount', label: t('sortProductCount') },
          ...(showFinancial
            ? [
                { value: 'units', label: t('sortUnits') },
                { value: 'revenue', label: t('sortRevenue') },
              ]
            : []),
        ]
  return (
    <DataTableToolbar
      activeCount={
        [status !== 'active', !!category, sortBy !== 'name', sortOrder !== 'asc'].filter(Boolean)
          .length
      }
      onReset={
        q || status !== 'active' || category || sortBy !== 'name' || sortOrder !== 'asc'
          ? onReset
          : undefined
      }
    >
      <label className="table-search grid">
        <span className="sr-only">
          {t(kind === 'products' ? 'searchProducts' : 'searchCategories')}
        </span>
        <span className="relative">
          <Search
            size={17}
            className="absolute left-3 top-4 text-[var(--muted)]"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label={t(kind === 'products' ? 'searchProducts' : 'searchCategories')}
            className="pl-10"
            value={q}
            maxLength={100}
            onChange={(event) => onChange('q', event.target.value)}
            placeholder={t(kind === 'products' ? 'searchProductsHint' : 'searchCategoriesHint')}
          />
        </span>
      </label>
      {kind === 'products' && category !== undefined && (
        <div className="table-filter grid">
          <Combobox
            value={category}
            onValueChange={(value) => onChange('category', value)}
            options={[
              { value: '__uncategorized__', label: t('uncategorized') },
              ...categories.map((item) => ({ value: item.id, label: item.name })),
            ]}
            placeholder={t('allCategories')}
            clearLabel={t('allCategories')}
            selectedLabel={
              category &&
              category !== '__uncategorized__' &&
              !categories.some((item) => item.id === category)
                ? t('categoryUnavailable')
                : undefined
            }
            aria-label={t('category')}
            loading={categoriesLoading}
            error={categoriesError}
            onRetry={onCategoriesRetry}
          />
        </div>
      )}
      <label className="table-filter grid">
        <span className="sr-only">{t('status')}</span>
        <Select value={status} onValueChange={(value) => onChange('status', value)}>
          <SelectOption value="active">{t('active')}</SelectOption>
          <SelectOption value="archived">{t('archived')}</SelectOption>
          <SelectOption value="all">{t('all')}</SelectOption>
        </Select>
      </label>
      <label className="table-filter grid">
        <span className="sr-only">{t('sort')}</span>
        <Select value={sortBy} onValueChange={(value) => onChange('sortBy', value)}>
          {sorts.map((item) => (
            <SelectOption key={item.value} value={item.value}>
              {item.label}
            </SelectOption>
          ))}
        </Select>
      </label>
      <label className="table-filter grid">
        <span className="sr-only">{t('order')}</span>
        <Select value={sortOrder} onValueChange={(value) => onChange('sortOrder', value)}>
          <SelectOption value="asc">{t('ascending')}</SelectOption>
          <SelectOption value="desc">{t('descending')}</SelectOption>
        </Select>
      </label>
    </DataTableToolbar>
  )
}
