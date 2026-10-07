import '../translations'

import { Pencil, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'wouter'

import type { ListCategoryInsightsSortBy } from '../../../api/generated/models'
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
import { formatCount, formatRevenue } from '../components/catalog-format'
import { CatalogListFilters } from '../components/catalog-list-filters'
import { CatalogSummaryCards } from '../components/catalog-metrics'
import { catalogHref, catalogPeriodParams, readCatalogContext } from '../components/catalog-period'
import { CatalogPeriodFilters } from '../components/catalog-period-filters'
import { CatalogRecordActions } from '../components/catalog-record-actions'
import { CategoryInsightsTable } from '../components/category-insights-table'
import { useCategoryInsights } from '../queries'

export function CategoriesPage() {
  useUiLanguage()

  const { t } = useTranslation('catalog')
  const { can } = useAuthorization()
  const canBulk = ['update', 'delete'].some((action) => can(`categories.${action}`))
  const [params, setParams] = useSearchParams()
  const context = readCatalogContext(params)
  const canFinance = can('reports.read')
  const q = params.get('q') ?? ''
  const status = ['active', 'archived', 'all'].includes(params.get('status') ?? '')
    ? (params.get('status') as 'active' | 'archived' | 'all')
    : 'active'
  const requestedSort = params.get('sortBy') ?? 'name'
  const allowedSorts = canFinance
    ? ['name', 'productCount', 'units', 'revenue']
    : ['name', 'productCount']
  const sortBy: ListCategoryInsightsSortBy = allowedSorts.includes(requestedSort)
    ? (requestedSort as ListCategoryInsightsSortBy)
    : 'name'
  const sortOrder = params.get('sortOrder') === 'desc' ? 'desc' : 'asc'
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)
  const invalidCustom =
    canFinance &&
    context.period === 'custom' &&
    (!context.from || !context.to || context.from > context.to)
  const query = useCategoryInsights(
    {
      q: q || undefined,
      status,
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
    !invalidCustom,
  )
  const updateFilter = (key: string, value: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (
          !value ||
          (key === 'status' && value === 'active') ||
          (key === 'sortBy' && value === 'name') ||
          (key === 'sortOrder' && value === 'asc') ||
          (key === 'period' && value === 'month')
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
  const data = query.data
  const selection = useTableSelection(
    data?.items.map((item) => item.category) ?? [],
    params.toString(),
  )
  const financial = canFinance && data?.financialIncluded ? data.summary.financial : null
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <PageHeader
        eyebrow={t('catalog')}
        title={t('categories')}
        description={t('categoriesDescription')}
        actions={
          <Can permission="categories.create">
            <Link href="/products/categories/new" className={buttonVariants({})}>
              <Plus size={17} /> {t('addCategory')}
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
      {data && (
        <CatalogSummaryCards
          items={[
            { label: t('activeCategories'), value: formatCount(data.summary.activeCategoryCount) },
            {
              label: t('uncategorizedProducts'),
              value: formatCount(data.summary.uncategorizedProductCount),
            },
            ...(financial
              ? [
                  {
                    label: t('netRevenue'),
                    value: formatRevenue(financial.netRevenue, financial.currency),
                  },
                  {
                    label: t('topCategory'),
                    value: data.summary.topCategory?.name ?? t('noTopCategory'),
                    detail: data.summary.topCategory
                      ? formatRevenue(data.summary.topCategory.netRevenue, data.currency)
                      : undefined,
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
                for (const key of ['q', 'status', 'sortBy', 'sortOrder', 'page']) next.delete(key)
                return next
              },
              { replace: true },
            )
          }
          kind="categories"
          q={q}
          status={status}
          sortBy={sortBy}
          sortOrder={sortOrder}
          showFinancial={canFinance}
          onChange={updateFilter}
        />
        {canBulk && (
          <CatalogBulkActions
            resource="categories"
            selected={selection.selected}
            clear={selection.clear}
          />
        )}
        {invalidCustom ? null : query.isPending || query.isError ? (
          <div className="p-5">
            <RequestState query={query} />
          </div>
        ) : data?.items.length ? (
          <>
            <CategoryInsightsTable
              selection={canBulk ? selection : undefined}
              items={data.items}
              showFinancial={Boolean(financial)}
              href={(id) => catalogHref(`/products/categories/${id}`, params)}
              renderActions={(item) => (
                <div className="flex justify-end gap-2">
                  <Can permission="categories.update">
                    {!item.category.archivedAt && (
                      <ActionLink
                        href={`/products/categories/${item.category.id}/edit`}
                        label={t('edit')}
                      >
                        <Pencil size={16} />
                      </ActionLink>
                    )}
                  </Can>
                  <CatalogRecordActions resource="categories" record={item.category} compact />
                </div>
              )}
            />
          </>
        ) : (
          <div className="p-5">
            <EmptyState title={t('noCategories')} description={t('noCategoriesHint')} />
          </div>
        )}
        {!invalidCustom && !query.isPending && !query.isError && data && (
          <DataTablePagination
            onPageSizeChange={(size) => updateFilter('pageSize', String(size))}
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            disabled={query.isFetching}
            onPage={(page) => updateFilter('page', String(page))}
          />
        )}
      </section>
      {financial && (
        <p className="text-xs text-[var(--muted)]">
          {t('detailSalesCaveat')} {t('historicCategoryCaveat')}
        </p>
      )}
    </div>
  )
}
