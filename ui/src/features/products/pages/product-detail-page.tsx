import '../translations'

import { ArrowLeft, Pencil } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useParams, useSearchParams } from 'wouter'

import { MoreActions } from '../../../components/management/more-actions'
import { PageHeader } from '../../../components/management/page-header'
import { RequestState } from '../../../components/management/request-state'
import { StatusBadge } from '../../../components/management/status-badge'
import { buttonVariants } from '../../../components/ui/button'
import { useUiLanguage } from '../../../lib/i18n'
import { Can, useAuthorization } from '../../identity'
import { MediaPreview } from '../../media'
import { formatCount, formatRevenue, formatWeight } from '../components/catalog-format'
import { CatalogSummaryCards } from '../components/catalog-metrics'
import { catalogHref, catalogPeriodParams, readCatalogContext } from '../components/catalog-period'
import { CatalogPeriodFilters } from '../components/catalog-period-filters'
import { CatalogRecordActions } from '../components/catalog-record-actions'
import { ProductRecentInvoices } from '../components/product-recent-invoices'
import { ProductVariantInsights } from '../components/product-variant-insights'
import { useProductInsight } from '../queries'

export function ProductDetailPage() {
  useUiLanguage()

  const { productId = '' } = useParams<{ productId: string }>()
  const [params, setParams] = useSearchParams()
  const [, navigate] = useLocation()
  const { t } = useTranslation('catalog')
  const { can } = useAuthorization()
  const context = readCatalogContext(params)
  const canFinance = can('reports.read')
  const canInvoices = canFinance && can('invoices.read')
  const invoicePage = Math.max(1, Number.parseInt(params.get('invoicePage') ?? '1', 10) || 1)
  const invalidCustom =
    canFinance &&
    context.period === 'custom' &&
    (!context.from || !context.to || context.from > context.to)
  const query = useProductInsight(
    productId,
    {
      ...(canFinance ? catalogPeriodParams(context) : {}),
      currency: canFinance ? context.currency || undefined : undefined,
      includeFinancial: canFinance,
      includeRecentInvoices: canInvoices,
      recentInvoiceLimit: canInvoices ? 10 : undefined,
      recentInvoiceOffset: canInvoices ? (invoicePage - 1) * 10 : undefined,
    },
    !invalidCustom,
  )
  const updateFilter = (key: string, value: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (
          !value ||
          (key === 'period' && value === 'month') ||
          (key === 'invoicePage' && value === '1')
        )
          next.delete(key)
        else next.set(key, value)
        if (key === 'period' && value !== 'custom') {
          next.delete('from')
          next.delete('to')
        }
        if (key !== 'invoicePage') next.delete('invoicePage')
        return next
      },
      { replace: true },
    )
  const data = query.data
  const product = data?.product
  const financial = canFinance ? data?.financial : null
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <Link
        href={catalogHref('/products', params)}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--muted)]"
      >
        <ArrowLeft size={16} />
        {t('backToProducts')}
      </Link>
      {product && (
        <PageHeader
          eyebrow={product.reference}
          title={product.name}
          description={product.description || t('productFallbackDescription')}
          actions={
            <div className="flex flex-wrap gap-2">
              <Can permission="products.update">
                {!product.archivedAt && (
                  <Link href={`/products/${product.id}/edit`} className={buttonVariants({})}>
                    <Pencil size={16} /> {t('editProduct')}
                  </Link>
                )}
              </Can>
              <MoreActions>
                <CatalogRecordActions
                  resource="products"
                  record={product}
                  onDeleted={() => navigate('/products')}
                />
              </MoreActions>
            </div>
          }
        />
      )}
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
      {!invalidCustom && (query.isPending || query.isError) && <RequestState query={query} />}
      {data && product && (
        <>
          {financial && (
            <CatalogSummaryCards
              items={[
                { label: t('itemUnitsSold'), value: formatCount(financial.unitsSold) },
                { label: t('packageWeightSold'), value: formatWeight(financial.weightSoldG) },
                {
                  label: t('netRevenue'),
                  value: formatRevenue(financial.netRevenue, financial.currency),
                },
                { label: t('invoiceCount'), value: formatCount(financial.invoiceCount) },
              ]}
            />
          )}
          <div className="grid gap-content lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
            <ProductVariantInsights
              items={data.variants}
              catalogCurrency={data.catalogCurrency}
              showFinancial={Boolean(financial)}
            />
            <aside className="grid content-start gap-content">
              <section className="rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-lg font-bold">{t('productDetails')}</h2>
                  <StatusBadge
                    label={t(product.archivedAt ? 'archived' : 'active')}
                    tone={product.archivedAt ? 'archived' : 'active'}
                  />
                </div>
                {product.imageAssetId && (
                  <div className="mb-5">
                    <MediaPreview assetId={product.imageAssetId} alt={product.name} />
                  </div>
                )}
                <dl className="grid gap-4 text-sm">
                  <div>
                    <dt className="text-[var(--muted)]">{t('category')}</dt>
                    <dd className="font-semibold">
                      {data.categoryName ??
                        t(product.categoryId ? 'categoryUnavailable' : 'uncategorized')}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--muted)]">{t('reference')}</dt>
                    <dd className="font-semibold">{product.reference}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--muted)]">{t('suggestedVat')}</dt>
                    <dd className="font-semibold">
                      {product.suggestedVatRate == null
                        ? t('noVat')
                        : t('vatExplicit', { rate: product.suggestedVatRate })}
                    </dd>
                  </div>
                </dl>
              </section>
            </aside>
          </div>
          {canInvoices && data.recentInvoicesIncluded && (
            <ProductRecentInvoices
              items={data.recentInvoices}
              page={invoicePage}
              total={data.recentInvoiceTotal}
              onPage={(next) => updateFilter('invoicePage', String(next))}
            />
          )}
          {financial && <p className="text-xs text-[var(--muted)]">{t('detailSalesCaveat')}</p>}
        </>
      )}
    </div>
  )
}
