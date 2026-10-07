import '../translations'

import { PackageOpen, Pencil, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'wouter'

import type { ListProductInsightsSortBy } from '../../../api/generated/models'
import { ActionLink } from '../../../components/management/action-link'
import { DataTablePagination } from '../../../components/management/data-table-pagination'
import { PageHeader } from '../../../components/management/page-header'
import { EmptyState } from '../../../components/management/page-state'
import { RequestState } from '../../../components/management/request-state'
import { useTableSelection } from '../../../components/management/use-table-selection'
import { buttonVariants } from '../../../components/ui/button'
import { useUiLanguage } from '../../../lib/i18n'
import { Can, useAuthorization } from '../../identity'
import { CatalogBulkActions } from '../components/catalog-bulk-actions'
import { formatCount, formatRevenue, formatWeight } from '../components/catalog-format'
import { CatalogListFilters } from '../components/catalog-list-filters'
import { CatalogSummaryCards } from '../components/catalog-metrics'
import { catalogHref, catalogPeriodParams, readCatalogContext } from '../components/catalog-period'
import { CatalogPeriodFilters } from '../components/catalog-period-filters'
import { CatalogRecordActions } from '../components/catalog-record-actions'
import { ProductInsightsTable } from '../components/product-insights-table'
import { useCategories, useProductInsights } from '../queries'

const productSorts = ['name', 'reference', 'units', 'weight', 'revenue'] as const
const countSorts = ['name', 'reference'] as const

export function ProductsPage() {
  useUiLanguage()

  const { t } = useTranslation('catalog')
  const { can } = useAuthorization()
  const canBulk =
    (can('products.update') && can('categories.read')) ||
    ['update', 'delete'].some((action) => can(`products.${action}`))
  const [params, setParams] = useSearchParams()
  const context = readCatalogContext(params)
  const canFinance = can('reports.read')
  const canCategories = can('categories.read')
  const q = params.get('q') ?? ''
  const status = ['active', 'archived', 'all'].includes(params.get('status') ?? '')
    ? (params.get('status') as 'active' | 'archived' | 'all')
    : 'active'
  const category =
    params.get('uncategorized') === 'true' ? '__uncategorized__' : (params.get('categoryId') ?? '')
  const requestedSort = params.get('sortBy') ?? 'name'
  const sortBy: ListProductInsightsSortBy = (canFinance ? productSorts : countSorts).some(
    (value) => value === requestedSort,
  )
    ? (requestedSort as ListProductInsightsSortBy)
    : 'name'
  const sortOrder = params.get('sortOrder') === 'desc' ? 'desc' : 'asc'
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)
  const pageSize = [10, 25, 50].includes(Number(params.get('pageSize')))
    ? Number(params.get('pageSize'))
    : 25
  const invalidCustom =
    canFinance &&
    context.period === 'custom' &&
    (!context.from || !context.to || context.from > context.to)
  const dates = canFinance ? catalogPeriodParams(context) : {}
  const products = useProductInsights(
    {
      q: q || undefined,
      status,
      categoryId: category && category !== '__uncategorized__' ? category : undefined,
      uncategorized: category === '__uncategorized__' || undefined,
      page,
      pageSize,
      sortBy,
      sortOrder,
      ...dates,
      currency: canFinance ? context.currency || undefined : undefined,
      includeFinancial: canFinance,
    },
    !invalidCustom,
  )
  const categories = useCategories({ status: 'all' }, canCategories)
  const updateFilter = (key: string, value: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (key === 'category') {
          next.delete('categoryId')
          next.delete('uncategorized')
          if (value === '__uncategorized__') next.set('uncategorized', 'true')
          else if (value) next.set('categoryId', value)
        } else if (
          !value ||
          (key === 'status' && value === 'active') ||
          (key === 'sortBy' && value === 'name') ||
          (key === 'sortOrder' && value === 'asc') ||
          (key === 'period' && value === 'month')
        ) {
          next.delete(key)
        } else next.set(key, value)
        if (key === 'period' && value !== 'custom') {
          next.delete('from')
          next.delete('to')
        }
        if (key !== 'page') next.delete('page')
        return next
      },
      { replace: true },
    )
  const data = products.data
  const showFinancial = canFinance && Boolean(data?.financialIncluded)
  const selection = useTableSelection(
    data?.items.map((item) => item.product) ?? [],
    params.toString(),
  )
  const financial = showFinancial ? data?.summary.financial : null
  const summary = data?.summary
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <PageHeader
        eyebrow={t('catalog')}
        title={t('products')}
        description={t('productsDescription')}
        actions={
          <Can permission="products.create">
            <Link href="/products/new" className={buttonVariants({})}>
              <Plus size={17} /> {t('addProduct')}
            </Link>
          </Can>
        }
      />
      {canFinance && (
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
      {invalidCustom && (
        <p role="alert" className="text-sm text-[var(--error-text)]">
          {t('invalidDateRange')}
        </p>
      )}
      {summary && (
        <CatalogSummaryCards
          items={[
            { label: t('activeProducts'), value: formatCount(summary.activeProductCount) },
            { label: t('activeVariants'), value: formatCount(summary.activeVariantCount) },
            ...(financial
              ? [
                  {
                    label: t('itemUnitsSold'),
                    value: formatCount(financial.unitsSold),
                    detail: `${t('packageWeightSold')}: ${formatWeight(financial.weightSoldG)}`,
                  },
                  {
                    label: t('netRevenue'),
                    value: formatRevenue(financial.netRevenue, financial.currency),
                  },
                ]
              : []),
          ]}
        />
      )}
      <section className="overflow-hidden rounded-panel border border-[var(--border)] bg-[var(--surface)]">
        <CatalogListFilters
          onReset={() =>
            setParams(
              (current) => {
                const next = new URLSearchParams(current)
                for (const key of [
                  'q',
                  'status',
                  'categoryId',
                  'uncategorized',
                  'sortBy',
                  'sortOrder',
                  'page',
                ])
                  next.delete(key)
                return next
              },
              { replace: true },
            )
          }
          kind="products"
          q={q}
          status={status}
          category={canCategories ? category : undefined}
          categories={categories.data ?? []}
          categoriesLoading={categories.isPending && canCategories}
          categoriesError={categories.isError}
          onCategoriesRetry={() => void categories.refetch()}
          sortBy={sortBy}
          sortOrder={sortOrder}
          showFinancial={canFinance}
          onChange={updateFilter}
        />
        {canBulk && (
          <CatalogBulkActions
            resource="products"
            selected={selection.selected}
            clear={selection.clear}
          />
        )}
        {invalidCustom ? null : products.isPending || products.isError ? (
          <div className="p-5">
            <RequestState query={products} />
          </div>
        ) : data?.items.length ? (
          <>
            <ProductInsightsTable
              selection={canBulk ? selection : undefined}
              items={data.items}
              catalogCurrency={data.catalogCurrency}
              showFinancial={showFinancial}
              href={(id) => catalogHref(`/products/${id}`, params)}
              renderActions={(item) => (
                <div className="flex justify-end gap-2">
                  <Can permission="products.update">
                    {!item.product.archivedAt && (
                      <ActionLink href={`/products/${item.product.id}/edit`} label={t('edit')}>
                        <Pencil size={16} />
                      </ActionLink>
                    )}
                  </Can>
                  <CatalogRecordActions resource="products" record={item.product} compact />
                </div>
              )}
            />
          </>
        ) : (
          <div className="p-5">
            <EmptyState
              title={t('noProducts')}
              description={t('noProductsHint')}
              action={
                <Can permission="products.create">
                  <Link href="/products/new" className={buttonVariants({})}>
                    <PackageOpen size={16} /> {t('addProduct')}
                  </Link>
                </Can>
              }
            />
          </div>
        )}
        {!invalidCustom && !products.isPending && !products.isError && data && (
          <DataTablePagination
            onPageSizeChange={(size) => updateFilter('pageSize', String(size))}
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            disabled={products.isFetching}
            onPage={(page) => updateFilter('page', String(page))}
          />
        )}
      </section>
      {showFinancial && <p className="text-xs text-[var(--muted)]">{t('detailSalesCaveat')}</p>}
    </div>
  )
}
