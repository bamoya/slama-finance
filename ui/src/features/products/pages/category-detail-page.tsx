import '../translations'

import { ArrowLeft, Pencil, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useParams, useSearchParams } from 'wouter'

import type { GetCategoryInsightsSortBy } from '../../../api/generated/models'
import { DataTablePagination } from '../../../components/management/data-table-pagination'
import { DataTableToolbar } from '../../../components/management/data-table-toolbar'
import { MoreActions } from '../../../components/management/more-actions'
import { PageHeader } from '../../../components/management/page-header'
import { RequestState } from '../../../components/management/request-state'
import { StatusBadge } from '../../../components/management/status-badge'
import { buttonVariants } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Select, SelectOption } from '../../../components/ui/select'
import { useUiLanguage } from '../../../lib/i18n'
import { Can, useAuthorization } from '../../identity'
import { formatCount, formatRevenue, formatWeight } from '../components/catalog-format'
import { CatalogSummaryCards } from '../components/catalog-metrics'
import { catalogHref, catalogPeriodParams, readCatalogContext } from '../components/catalog-period'
import { CatalogPeriodFilters } from '../components/catalog-period-filters'
import { CatalogRecordActions } from '../components/catalog-record-actions'
import { ProductInsightsTable } from '../components/product-insights-table'
import { useCategory, useCategoryInsight } from '../queries'

export function CategoryDetailPage() {
  useUiLanguage()

  const { categoryId = '' } = useParams<{ categoryId: string }>()
  const [params, setParams] = useSearchParams()
  const [, navigate] = useLocation()
  const { t } = useTranslation('catalog')
  const { can } = useAuthorization()
  const context = readCatalogContext(params)
  const canProducts = can('products.read')
  const canFinance = can('reports.read')
  const q = params.get('q') ?? ''
  const sortRequest = params.get('sortBy') ?? (canFinance ? 'revenue' : 'name')
  const sortBy: GetCategoryInsightsSortBy = (canFinance
    ? ['name', 'units', 'revenue']
    : ['name']
  ).includes(sortRequest)
    ? (sortRequest as GetCategoryInsightsSortBy)
    : 'name'
  const sortOrder =
    params.get('sortOrder') === 'asc'
      ? 'asc'
      : params.get('sortOrder') === 'desc'
        ? 'desc'
        : sortBy === 'revenue'
          ? 'desc'
          : 'asc'
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)
  const invalidCustom =
    canFinance &&
    context.period === 'custom' &&
    (!context.from || !context.to || context.from > context.to)
  const base = useCategory(categoryId)
  const insights = useCategoryInsight(
    categoryId,
    {
      q: q || undefined,
      page,
      pageSize: [10, 25, 50].includes(Number(params.get('pageSize')))
        ? Number(params.get('pageSize'))
        : 25,
      sortBy,
      sortOrder,
      ...(canFinance ? catalogPeriodParams(context) : {}),
      currency: canFinance ? context.currency || undefined : undefined,
      includeFinancial: canFinance,
    },
    canProducts && !invalidCustom,
  )
  const updateFilter = (key: string, value: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (
          !value ||
          (key === 'period' && value === 'month') ||
          (key === 'sortBy' && value === 'name') ||
          (key === 'sortOrder' && value === 'asc') ||
          (key === 'page' && value === '1')
        )
          next.delete(key)
        else next.set(key, value)
        if (key === 'period' && value !== 'custom') {
          next.delete('from')
          next.delete('to')
        }
        if (key !== 'page') next.delete('page')
        return next
      },
      { replace: true },
    )
  const category = base.data
  const data = insights.data
  const financial = canFinance ? data?.financial : null
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <Link
        href={catalogHref('/products/categories', params)}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--muted)]"
      >
        <ArrowLeft size={16} />
        {t('backToCategories')}
      </Link>
      {(base.isPending || base.isError) && <RequestState query={base} />}
      {category && (
        <>
          <PageHeader
            eyebrow={t('categoryDetails')}
            title={category.name}
            description={category.description || t('noDescription')}
            actions={
              <div className="flex flex-wrap gap-2">
                <Can permission="categories.update">
                  {!category.archivedAt && (
                    <Link
                      href={`/products/categories/${category.id}/edit`}
                      className={buttonVariants({})}
                    >
                      <Pencil size={16} /> {t('editCategory')}
                    </Link>
                  )}
                </Can>
                <MoreActions>
                  <CatalogRecordActions
                    resource="categories"
                    record={category}
                    onDeleted={() => navigate('/products/categories')}
                  />
                </MoreActions>
              </div>
            }
          />
          {canFinance && canProducts && (
            <CatalogPeriodFilters
              onRangeChange={(from, to) =>
                setParams(
                  (current) => {
                    const next = new URLSearchParams(current)
                    for (const [key, value] of [
                      ['from', from],
                      ['to', to],
                    ] as const) {
                      if (value) next.set(key, value)
                      else next.delete(key)
                    }
                    next.delete('page')
                    next.delete('invoicePage')
                    return next
                  },
                  { replace: true },
                )
              }
              context={context}
              resolvedCurrency={data?.currency ?? 'MAD'}
              onChange={updateFilter}
            />
          )}
          {invalidCustom && canProducts && (
            <p role="alert" className="text-sm text-[var(--error-text)]">
              {t('invalidDateRange')}
            </p>
          )}
          {data && (
            <CatalogSummaryCards
              items={[
                {
                  label: t('activeProducts'),
                  value: formatCount(data.activeProductCount),
                  detail: `${t('productsCount')}: ${formatCount(data.productCount)}`,
                },
                ...(financial
                  ? [
                      { label: t('itemUnitsSold'), value: formatCount(financial.unitsSold) },
                      { label: t('packageWeightSold'), value: formatWeight(financial.weightSoldG) },
                      {
                        label: t('netRevenue'),
                        value: formatRevenue(financial.netRevenue, financial.currency),
                      },
                    ]
                  : []),
              ]}
            />
          )}
          {canProducts && (
            <section className="overflow-hidden rounded-panel border border-[var(--border)] bg-[var(--surface)]">
              <h2 className="p-5 text-lg font-bold">{t('linkedProducts')}</h2>
              <DataTableToolbar className="border-t border-[var(--border)]">
                <label className="table-search grid">
                  <span className="sr-only">{t('searchProducts')}</span>
                  <span className="relative">
                    <Search
                      size={17}
                      className="absolute left-3 top-4 text-[var(--muted)]"
                      aria-hidden="true"
                    />
                    <Input
                      type="search"
                      className="pl-10"
                      aria-label={t('searchProducts')}
                      placeholder={t('searchProductsHint')}
                      value={q}
                      maxLength={100}
                      onChange={(event) => updateFilter('q', event.target.value)}
                    />
                  </span>
                </label>
                <label className="table-filter grid">
                  <span className="sr-only">{t('sort')}</span>
                  <Select value={sortBy} onValueChange={(value) => updateFilter('sortBy', value)}>
                    <SelectOption value="name">{t('sortName')}</SelectOption>
                    {canFinance && (
                      <>
                        <SelectOption value="units">{t('sortUnits')}</SelectOption>
                        <SelectOption value="revenue">{t('sortRevenue')}</SelectOption>
                      </>
                    )}
                  </Select>
                </label>
                <label className="table-filter grid">
                  <span className="sr-only">{t('order')}</span>
                  <Select
                    value={sortOrder}
                    onValueChange={(value) => updateFilter('sortOrder', value)}
                  >
                    <SelectOption value="asc">{t('ascending')}</SelectOption>
                    <SelectOption value="desc">{t('descending')}</SelectOption>
                  </Select>
                </label>
              </DataTableToolbar>
              {!invalidCustom && (insights.isPending || insights.isError) ? (
                <div className="p-5">
                  <RequestState query={insights} />
                </div>
              ) : data?.products.items.length ? (
                <>
                  <ProductInsightsTable
                    items={data.products.items}
                    catalogCurrency={data.catalogCurrency}
                    showFinancial={Boolean(financial)}
                    showCategory={false}
                    href={(id) => catalogHref(`/products/${id}`, params)}
                  />
                </>
              ) : (
                !invalidCustom && (
                  <p className="p-5 text-sm text-[var(--muted)]">{t('emptySearchProducts')}</p>
                )
              )}
              {!invalidCustom && !insights.isPending && !insights.isError && data && (
                <DataTablePagination
                  onPageSizeChange={(size) => updateFilter('pageSize', String(size))}
                  page={data.products.page}
                  pageSize={data.products.pageSize}
                  total={data.products.total}
                  disabled={insights.isFetching}
                  onPage={(page) => updateFilter('page', String(page))}
                />
              )}
            </section>
          )}
          <section className="rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
            <h2 className="mb-4 text-lg font-bold">{t('status')}</h2>
            <StatusBadge
              label={t(category.archivedAt ? 'archived' : 'active')}
              tone={category.archivedAt ? 'archived' : 'active'}
            />
            <p className="mt-4 text-sm text-[var(--muted)]">{t('categoryDeleteNote')}</p>
          </section>
          {financial && (
            <p className="text-xs text-[var(--muted)]">
              {t('detailSalesCaveat')} {t('historicCategoryCaveat')}
            </p>
          )}
        </>
      )}
    </div>
  )
}
