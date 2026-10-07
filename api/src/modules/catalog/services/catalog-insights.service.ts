import {
  type CatalogFinancialSummary,
  CategoryInsightsDetailSchema,
  CategoryInsightsPageSchema,
  CategorySchema,
  type GetCategoryInsightsQuery,
  type GetProductInsightsQuery,
  type ListCategoryInsightsQuery,
  type ListProductInsightsQuery,
  ProductInsightsDetailSchema,
  ProductInsightsPageSchema,
  ProductSchema,
} from '../../../contracts/generated/catalog/catalog.schemas.js'
import { AppError } from '../../../lib/errors.js'
import type {
  AggregateRow,
  createCatalogInsightsRepository,
  InsightPeriod,
} from '../repositories/catalog-insights.repository.js'

type Repo = ReturnType<typeof createCatalogInsightsRepository>
type Catalog = Awaited<ReturnType<Repo['catalog']>>
type ProductRow = Catalog['products'][number]
type CategoryRow = Catalog['categories'][number]
type FinancialRow = Pick<AggregateRow, 'units' | 'weight' | 'revenue' | 'invoiceCount'>

const serialize = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown
const moneyCents = (value: string) => {
  const [whole = '0', decimal = ''] = value.split('.')
  return BigInt(whole) * 100n + BigInt(decimal.padEnd(2, '0').slice(0, 2))
}
const centsText = (value: bigint) => `${value / 100n}.${String(value % 100n).padStart(2, '0')}`
const safeInteger = (value: string) => {
  const parsed = BigInt(value.split('.')[0] ?? '0')
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER))
    throw new AppError(422, 'AGGREGATE_TOO_LARGE', 'Sales total exceeds the supported range.')
  return Number(parsed)
}
const financial = (row: FinancialRow | undefined, currency: string): CatalogFinancialSummary => ({
  unitsSold: safeInteger(row?.units ?? '0'),
  weightSoldG: safeInteger(row?.weight ?? '0'),
  netRevenue: centsText(moneyCents(row?.revenue ?? '0')),
  invoiceCount: safeInteger(row?.invoiceCount ?? '0'),
  currency,
})
const compare = (a: string | number | bigint, b: string | number | bigint) =>
  a < b ? -1 : a > b ? 1 : 0

export function resolveCatalogPeriod(
  query: { currency?: string; period: string; dateFrom?: string; dateTo?: string },
  catalog: Pick<Catalog, 'companyCurrency' | 'companyTimezone'>,
  now = new Date(),
): InsightPeriod {
  if (query.period !== 'custom' && (query.dateFrom || query.dateTo))
    throw new AppError(400, 'INVALID_DATE_RANGE', 'Explicit dates require period=custom.')
  if (query.dateFrom && query.dateTo && query.dateFrom > query.dateTo)
    throw new AppError(400, 'INVALID_DATE_RANGE', 'dateFrom must not be after dateTo.')
  const currency = query.currency ?? catalog.companyCurrency
  if (query.period === 'all') return { currency }
  if (query.period === 'custom') return { currency, dateFrom: query.dateFrom, dateTo: query.dateTo }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: catalog.companyTimezone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now)
  const year = Number(parts.find((part) => part.type === 'year')!.value)
  const month = Number(parts.find((part) => part.type === 'month')!.value)
  const date = (yearValue: number, monthValue: number, day: number) =>
    `${yearValue}-${String(monthValue).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  if (query.period === 'this_year')
    return { currency, dateFrom: date(year, 1, 1), dateTo: date(year, 12, 31) }
  const first =
    query.period === 'last_month'
      ? new Date(Date.UTC(year, month - 2, 1))
      : new Date(Date.UTC(year, month - 1, 1))
  const y = first.getUTCFullYear(),
    m = first.getUTCMonth() + 1
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { currency, dateFrom: date(y, m, 1), dateTo: date(y, m, lastDay) }
}

export function createCatalogInsightsService(repo: Repo) {
  async function authorizedFinancial(actor: string, included: boolean) {
    if (!included) return
    if (!(await repo.can(actor, 'reports.read')))
      throw new AppError(403, 'FORBIDDEN', 'Revenue reporting permission is required.')
  }
  function variants(catalog: Catalog, productId: string) {
    return catalog.variants
      .filter((variant) => variant.productId === productId)
      .sort((a, b) => a.weightG - b.weightG)
  }
  function productDto(catalog: Catalog, row: ProductRow) {
    return ProductSchema.parse(serialize({ ...row, variants: variants(catalog, row.id) }))
  }
  function categoryName(catalog: Catalog, categoryId: string | null) {
    return catalog.categories.find((category) => category.id === categoryId)?.name ?? null
  }
  const categoryDto = (row: CategoryRow) => CategorySchema.parse(serialize(row))
  async function productAggregates(included: boolean, currentPeriod: InsightPeriod) {
    return new Map(
      (included ? await repo.aggregates('product', currentPeriod) : []).map((row) => [row.id, row]),
    )
  }
  async function productPage(
    catalog: Catalog,
    currentPeriod: InsightPeriod,
    query: ListProductInsightsQuery,
    financialRows: Map<string, AggregateRow>,
    showCategoryName: boolean,
  ) {
    if (query.categoryId && query.uncategorized)
      throw new AppError(400, 'INVALID_FILTER', 'Choose a category or uncategorized, not both.')
    if (['units', 'weight', 'revenue'].includes(query.sortBy) && !query.includeFinancial)
      throw new AppError(
        403,
        'FORBIDDEN',
        'Revenue reporting permission is required to sort by sales.',
      )
    const q = query.q?.trim().toLocaleLowerCase() ?? ''
    const matches = catalog.products.filter(
      (product) =>
        (!q || `${product.name} ${product.reference}`.toLocaleLowerCase().includes(q)) &&
        (!query.categoryId || product.categoryId === query.categoryId) &&
        (!query.uncategorized || !product.categoryId),
    )
    const visible = matches.filter(
      (product) =>
        query.status === 'all' ||
        (query.status === 'active' ? !product.archivedAt : !!product.archivedAt),
    )
    const metric = (product: ProductRow) => {
      const row = financialRows.get(product.id)
      if (query.sortBy === 'units') return BigInt(row?.units ?? '0')
      if (query.sortBy === 'weight') return BigInt(row?.weight ?? '0')
      if (query.sortBy === 'revenue') return moneyCents(row?.revenue ?? '0')
      return query.sortBy === 'reference'
        ? product.reference.toLocaleLowerCase()
        : product.name.toLocaleLowerCase()
    }
    visible.sort(
      (a, b) =>
        compare(metric(a), metric(b)) * (query.sortOrder === 'desc' ? -1 : 1) ||
        compare(a.id, b.id),
    )
    const paged = visible.slice((query.page - 1) * query.pageSize, query.page * query.pageSize)
    const summaryRow = query.includeFinancial
      ? await repo.aggregateForProductIds(
          visible.map((product) => product.id),
          currentPeriod,
        )
      : null
    return ProductInsightsPageSchema.parse({
      items: paged.map((product) => {
        const ownVariants = variants(catalog, product.id)
        return {
          product: productDto(catalog, product),
          categoryName: showCategoryName ? categoryName(catalog, product.categoryId) : null,
          variantCount: ownVariants.length,
          activeVariantCount: ownVariants.filter((variant) => !variant.archivedAt).length,
          financial: query.includeFinancial
            ? financial(financialRows.get(product.id), currentPeriod.currency)
            : null,
        }
      }),
      total: visible.length,
      page: query.page,
      pageSize: query.pageSize,
      summary: {
        productCount: matches.length,
        activeProductCount: matches.filter((product) => !product.archivedAt).length,
        archivedProductCount: matches.filter((product) => !!product.archivedAt).length,
        activeVariantCount: catalog.variants.filter(
          (variant) =>
            !variant.archivedAt &&
            matches.some((product) => !product.archivedAt && product.id === variant.productId),
        ).length,
        financial: summaryRow ? financial(summaryRow, currentPeriod.currency) : null,
      },
      financialIncluded: query.includeFinancial,
      currency: currentPeriod.currency,
      catalogCurrency: catalog.companyCurrency,
    })
  }
  return {
    async listProducts(query: ListProductInsightsQuery, actor: string) {
      await authorizedFinancial(actor, query.includeFinancial)
      const catalog = await repo.catalog()
      const currentPeriod = resolveCatalogPeriod(query, catalog)
      const showCategoryName = await repo.can(actor, 'categories.read')
      return productPage(
        catalog,
        currentPeriod,
        query,
        await productAggregates(query.includeFinancial, currentPeriod),
        showCategoryName,
      )
    },
    async product(id: string, query: GetProductInsightsQuery, actor: string) {
      await authorizedFinancial(actor, query.includeFinancial)
      if (query.includeRecentInvoices && !query.includeFinancial)
        throw new AppError(400, 'INVALID_FILTER', 'Recent invoices require financial insights.')
      if (query.includeRecentInvoices && !(await repo.can(actor, 'invoices.read')))
        throw new AppError(403, 'FORBIDDEN', 'Invoice read permission is required.')
      const catalog = await repo.catalog()
      const product = catalog.products.find((row) => row.id === id)
      if (!product) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found.')
      const currentPeriod = resolveCatalogPeriod(query, catalog)
      const [productRows, variantRows, recent] = await Promise.all([
        productAggregates(query.includeFinancial, currentPeriod),
        query.includeFinancial ? repo.aggregates('variant', currentPeriod) : Promise.resolve([]),
        query.includeRecentInvoices
          ? repo.recentInvoices(
              id,
              currentPeriod,
              query.recentInvoiceLimit,
              query.recentInvoiceOffset,
            )
          : Promise.resolve({ total: 0, rows: [] }),
      ])
      const byVariant = new Map(variantRows.map((row) => [row.id, row]))
      return ProductInsightsDetailSchema.parse({
        product: productDto(catalog, product),
        categoryName: (await repo.can(actor, 'categories.read'))
          ? categoryName(catalog, product.categoryId)
          : null,
        financial: query.includeFinancial
          ? financial(productRows.get(id), currentPeriod.currency)
          : null,
        variants: variants(catalog, id).map((variant) => ({
          variant: serialize(variant),
          financial: query.includeFinancial
            ? financial(byVariant.get(variant.id), currentPeriod.currency)
            : null,
        })),
        recentInvoices: recent.rows.map((row) => ({
          id: row.id,
          number: row.number,
          issueDate: row.issueDate,
          status: row.status,
          quantity: safeInteger(row.units),
          weightSoldG: safeInteger(row.weight),
          netRevenue: centsText(moneyCents(row.revenue)),
          currency: currentPeriod.currency,
        })),
        recentInvoicesIncluded: query.includeRecentInvoices,
        recentInvoiceTotal: recent.total,
        currency: currentPeriod.currency,
        catalogCurrency: catalog.companyCurrency,
      })
    },
    async listCategories(query: ListCategoryInsightsQuery, actor: string) {
      await authorizedFinancial(actor, query.includeFinancial)
      if (['units', 'revenue'].includes(query.sortBy) && !query.includeFinancial)
        throw new AppError(
          403,
          'FORBIDDEN',
          'Revenue reporting permission is required to sort by sales.',
        )
      const catalog = await repo.catalog()
      const currentPeriod = resolveCatalogPeriod(query, catalog)
      const q = query.q?.trim().toLocaleLowerCase() ?? ''
      const matches = catalog.categories.filter(
        (category) => !q || category.name.toLocaleLowerCase().includes(q),
      )
      const visible = matches.filter(
        (category) =>
          query.status === 'all' ||
          (query.status === 'active' ? !category.archivedAt : !!category.archivedAt),
      )
      const categoryRows = new Map(
        (query.includeFinancial ? await repo.aggregates('category', currentPeriod) : []).map(
          (row) => [row.id, row],
        ),
      )
      const productsFor = (id: string) =>
        catalog.products.filter((product) => product.categoryId === id)
      const metric = (category: CategoryRow) => {
        if (query.sortBy === 'productCount') return productsFor(category.id).length
        if (query.sortBy === 'units') return BigInt(categoryRows.get(category.id)?.units ?? '0')
        if (query.sortBy === 'revenue')
          return moneyCents(categoryRows.get(category.id)?.revenue ?? '0')
        return category.name.toLocaleLowerCase()
      }
      visible.sort(
        (a, b) =>
          compare(metric(a), metric(b)) * (query.sortOrder === 'desc' ? -1 : 1) ||
          compare(a.id, b.id),
      )
      const paged = visible.slice((query.page - 1) * query.pageSize, query.page * query.pageSize)
      const summaryRow = query.includeFinancial
        ? await repo.aggregateForProductIds(
            catalog.products
              .filter((product) => visible.some((category) => category.id === product.categoryId))
              .map((product) => product.id),
            currentPeriod,
          )
        : null
      const top = query.includeFinancial
        ? [...visible].sort(
            (a, b) =>
              compare(
                moneyCents(categoryRows.get(b.id)?.revenue ?? '0'),
                moneyCents(categoryRows.get(a.id)?.revenue ?? '0'),
              ) || compare(a.id, b.id),
          )[0]
        : undefined
      return CategoryInsightsPageSchema.parse({
        items: paged.map((category) => {
          const own = productsFor(category.id)
          return {
            category: categoryDto(category),
            productCount: own.length,
            activeProductCount: own.filter((product) => !product.archivedAt).length,
            archivedProductCount: own.filter((product) => !!product.archivedAt).length,
            financial: query.includeFinancial
              ? financial(categoryRows.get(category.id), currentPeriod.currency)
              : null,
          }
        }),
        total: visible.length,
        page: query.page,
        pageSize: query.pageSize,
        summary: {
          categoryCount: matches.length,
          activeCategoryCount: matches.filter((category) => !category.archivedAt).length,
          archivedCategoryCount: matches.filter((category) => !!category.archivedAt).length,
          uncategorizedProductCount: catalog.products.filter((product) => !product.categoryId)
            .length,
          financial: summaryRow ? financial(summaryRow, currentPeriod.currency) : null,
          topCategory:
            top && moneyCents(categoryRows.get(top.id)?.revenue ?? '0') > 0n
              ? {
                  id: top.id,
                  name: top.name,
                  netRevenue: centsText(moneyCents(categoryRows.get(top.id)!.revenue)),
                }
              : null,
        },
        financialIncluded: query.includeFinancial,
        currency: currentPeriod.currency,
        catalogCurrency: catalog.companyCurrency,
      })
    },
    async category(id: string, query: GetCategoryInsightsQuery, actor: string) {
      await authorizedFinancial(actor, query.includeFinancial)
      if (['units', 'revenue'].includes(query.sortBy) && !query.includeFinancial)
        throw new AppError(
          403,
          'FORBIDDEN',
          'Revenue reporting permission is required to sort by sales.',
        )
      const catalog = await repo.catalog()
      const category = catalog.categories.find((row) => row.id === id)
      if (!category) throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Category not found.')
      const currentPeriod = resolveCatalogPeriod(query, catalog)
      const own = catalog.products.filter((product) => product.categoryId === id)
      const products = await productPage(
        catalog,
        currentPeriod,
        {
          ...query,
          categoryId: id,
          uncategorized: false,
          status: 'all',
          sortBy: query.sortBy,
        },
        await productAggregates(query.includeFinancial, currentPeriod),
        true,
      )
      const summaryRow = query.includeFinancial
        ? await repo.aggregateForProductIds(
            own.map((product) => product.id),
            currentPeriod,
          )
        : null
      return CategoryInsightsDetailSchema.parse({
        category: categoryDto(category),
        productCount: own.length,
        activeProductCount: own.filter((product) => !product.archivedAt).length,
        archivedProductCount: own.filter((product) => !!product.archivedAt).length,
        financial: summaryRow ? financial(summaryRow, currentPeriod.currency) : null,
        products,
        currency: currentPeriod.currency,
        catalogCurrency: catalog.companyCurrency,
      })
    },
  }
}
