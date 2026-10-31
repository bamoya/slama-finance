import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route, Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { formatRevenue } from './components/catalog-format'
import { catalogPeriodParams, readCatalogContext } from './components/catalog-period'
import { CategoriesPage } from './pages/categories-page'
import { CategoryDetailPage } from './pages/category-detail-page'
import { ProductDetailPage } from './pages/product-detail-page'
import { ProductsPage } from './pages/products-page'

const mocks = vi.hoisted(() => ({
  permissions: new Set<string>(),
  useProductInsights: vi.fn(),
  useCategoryInsights: vi.fn(),
  useCategoryInsight: vi.fn(),
  useCategories: vi.fn(),
  useCategory: vi.fn(),
  useProductInsight: vi.fn(),
}))

vi.mock('../identity', () => ({
  Can: ({ permission, children }: { permission: string; children: ReactNode }) =>
    mocks.permissions.has(permission) ? children : null,
  useAuthorization: () => ({ can: (permission: string) => mocks.permissions.has(permission) }),
}))
vi.mock('./queries', () => ({
  useProductInsights: mocks.useProductInsights,
  useCategoryInsights: mocks.useCategoryInsights,
  useCategoryInsight: mocks.useCategoryInsight,
  useCategories: mocks.useCategories,
  useCategory: mocks.useCategory,
  useProductInsight: mocks.useProductInsight,
}))
vi.mock('./components/catalog-record-actions', () => ({ CatalogRecordActions: () => null }))

const productId = '11111111-1111-4111-8111-111111111111'
const categoryId = '22222222-2222-4222-8222-222222222222'
const product = {
  id: productId,
  name: 'Walnuts',
  reference: 'WAL-01',
  categoryId,
  archivedAt: null,
  variants: [],
}
const category = { id: categoryId, name: 'Nuts', archivedAt: null }
const invoiceId = '33333333-3333-4333-8333-333333333333'
const financial = {
  unitsSold: 7,
  weightSoldG: 3500,
  netRevenue: '90071992547409.91',
  invoiceCount: 2,
  currency: 'EUR',
}
const productPage = (included: boolean) => ({
  items: [
    {
      product,
      categoryName: null,
      variantCount: 0,
      activeVariantCount: 0,
      financial: included ? financial : null,
    },
  ],
  total: 1,
  page: 1,
  pageSize: 25,
  summary: {
    productCount: 1,
    activeProductCount: 1,
    archivedProductCount: 0,
    activeVariantCount: 0,
    financial: included ? financial : null,
  },
  financialIncluded: included,
  currency: 'EUR',
})
const categoryPage = (included: boolean) => ({
  items: [
    {
      category,
      productCount: 1,
      activeProductCount: 1,
      archivedProductCount: 0,
      financial: included ? financial : null,
    },
  ],
  total: 1,
  page: 1,
  pageSize: 25,
  summary: {
    categoryCount: 1,
    activeCategoryCount: 1,
    archivedCategoryCount: 0,
    uncategorizedProductCount: 0,
    financial: included ? financial : null,
    topCategory: included
      ? { id: categoryId, name: 'Nuts', netRevenue: financial.netRevenue }
      : null,
  },
  financialIncluded: included,
  currency: 'EUR',
})

function visit(path: string, page: ReactNode) {
  const location = memoryLocation({ path, record: true })
  const route = path.startsWith('/products/categories/')
    ? '/products/categories/:categoryId'
    : path.startsWith('/products/categories')
      ? '/products/categories'
      : path.startsWith('/products/')
        ? '/products/:productId'
        : '/products'
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Router hook={location.hook}>
        <Route path={route}>{page}</Route>
      </Router>
    </QueryClientProvider>,
  )
  return location
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.permissions.clear()
  mocks.useProductInsights.mockReturnValue({
    data: productPage(false),
    isPending: false,
    isError: false,
  })
  mocks.useCategoryInsights.mockReturnValue({
    data: categoryPage(false),
    isPending: false,
    isError: false,
  })
  mocks.useCategories.mockReturnValue({
    data: [],
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  })
  mocks.useCategory.mockReturnValue({ data: category, isPending: false, isError: false })
  mocks.useCategoryInsight.mockReturnValue({ data: undefined, isPending: false, isError: false })
  mocks.useProductInsight.mockReturnValue({
    data: {
      product,
      categoryName: null,
      financial: null,
      variants: [],
      recentInvoices: [],
      recentInvoicesIncluded: false,
      recentInvoiceTotal: 0,
      currency: 'EUR',
      catalogCurrency: 'MAD',
    },
    isPending: false,
    isError: false,
  })
})

describe('catalog insights presentation', () => {
  it('clears table filters without discarding the reporting context', () => {
    mocks.permissions.add('products.read')
    mocks.permissions.add('reports.read')
    mocks.permissions.add('reports.sections.revenue')
    visit(
      '/products?q=wheat&status=archived&page=3&period=lastmonth&currency=EUR',
      <ProductsPage />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(mocks.useProductInsights).toHaveBeenLastCalledWith(
      expect.objectContaining({
        q: undefined,
        status: 'active',
        page: 1,
        period: 'last_month',
        currency: 'EUR',
      }),
      true,
    )
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
  })
  it('preserves cents for revenue beyond JavaScript safe-integer precision', () => {
    expect(formatRevenue('90071992547409.91', 'MAD')).toContain(',91')
  })

  it('sends presets for company-timezone resolution and leaves all-time unbounded', () => {
    expect(
      catalogPeriodParams(readCatalogContext(new URLSearchParams('period=lastmonth'))),
    ).toEqual({ period: 'last_month', dateFrom: undefined, dateTo: undefined })
    expect(catalogPeriodParams(readCatalogContext(new URLSearchParams('period=all')))).toEqual({
      period: 'all',
      dateFrom: undefined,
      dateTo: undefined,
    })
  })

  it('does not request or display sales metrics for a product reader without report grants', () => {
    mocks.permissions.add('products.read')
    visit('/products?sortBy=revenue&period=all&currency=EUR', <ProductsPage />)
    expect(mocks.useProductInsights).toHaveBeenCalledWith(
      expect.objectContaining({ sortBy: 'name', includeFinancial: false, currency: undefined }),
      true,
    )
    expect(screen.queryByText('Net revenue')).not.toBeInTheDocument()
    expect(screen.queryByText('Period')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Walnuts' })).toBeInTheDocument()
  })

  it('sends the selected period, currency, page and financial sort for an authorized reader', () => {
    mocks.permissions.add('products.read')
    mocks.permissions.add('reports.read')
    mocks.permissions.add('reports.sections.revenue')
    mocks.useProductInsights.mockReturnValue({
      data: productPage(true),
      isPending: false,
      isError: false,
    })
    visit(
      '/products?period=lastmonth&currency=EUR&sortBy=revenue&sortOrder=desc&page=2',
      <ProductsPage />,
    )
    expect(mocks.useProductInsights).toHaveBeenCalledWith(
      expect.objectContaining({
        period: 'last_month',
        currency: 'EUR',
        includeFinancial: true,
        sortBy: 'revenue',
        sortOrder: 'desc',
        page: 2,
      }),
      true,
    )
    expect(screen.getAllByText('Net revenue').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'Walnuts' })).toHaveAttribute(
      'href',
      `/products/${productId}?period=lastmonth&currency=EUR`,
    )
  })

  it('does not turn an API-hidden financial summary into a zero-value report', () => {
    mocks.permissions.add('products.read')
    mocks.permissions.add('reports.read')
    mocks.permissions.add('reports.sections.revenue')
    visit('/products', <ProductsPage />)
    expect(mocks.useProductInsights).toHaveBeenCalledWith(
      expect.objectContaining({ includeFinancial: true }),
      true,
    )
    expect(screen.queryByText('Net revenue')).not.toBeInTheDocument()
    expect(screen.queryByText('0,00 EUR')).not.toBeInTheDocument()
  })

  it('clamps private category sales sorting when reporting is unavailable', () => {
    mocks.permissions.add('categories.read')
    visit('/products/categories?sortBy=revenue&period=all', <CategoriesPage />)
    expect(mocks.useCategoryInsights).toHaveBeenCalledWith(
      expect.objectContaining({ sortBy: 'name', includeFinancial: false }),
      true,
    )
    expect(screen.queryByText('Net revenue')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Nuts' })).toBeInTheDocument()
  })

  it('does not request or show recent invoice links without invoice-read permission', () => {
    mocks.permissions.add('products.read')
    mocks.permissions.add('reports.read')
    mocks.permissions.add('reports.sections.revenue')
    mocks.useProductInsight.mockReturnValue({
      data: {
        product,
        categoryName: null,
        financial,
        variants: [],
        recentInvoices: [],
        recentInvoicesIncluded: false,
        recentInvoiceTotal: 0,
        currency: 'EUR',
        catalogCurrency: 'MAD',
      },
      isPending: false,
      isError: false,
    })
    visit(`/products/${productId}?period=all&currency=EUR`, <ProductDetailPage />)
    expect(mocks.useProductInsight).toHaveBeenCalledWith(
      productId,
      expect.objectContaining({ includeFinancial: true, includeRecentInvoices: false }),
      true,
    )
    expect(screen.queryByRole('link', { name: 'INV-26-001' })).not.toBeInTheDocument()
    expect(screen.queryByText('Recent invoices')).not.toBeInTheDocument()
    expect(screen.getAllByText('Net revenue').length).toBeGreaterThan(0)
  })

  it('requests paged recent invoice links when both report and invoice grants exist', () => {
    mocks.permissions.add('products.read')
    mocks.permissions.add('reports.read')
    mocks.permissions.add('reports.sections.revenue')
    mocks.permissions.add('invoices.read')
    mocks.useProductInsight.mockReturnValue({
      data: {
        product,
        categoryName: null,
        financial,
        variants: [],
        recentInvoices: [
          {
            id: invoiceId,
            number: 'INV-26-001',
            issueDate: '2026-09-30',
            status: 'issued',
            quantity: 7,
            weightSoldG: 3500,
            netRevenue: '123.45',
            currency: 'EUR',
          },
        ],
        recentInvoicesIncluded: true,
        recentInvoiceTotal: 21,
        currency: 'EUR',
        catalogCurrency: 'MAD',
      },
      isPending: false,
      isError: false,
    })
    visit(`/products/${productId}?period=all&currency=EUR&invoicePage=3`, <ProductDetailPage />)
    expect(mocks.useProductInsight).toHaveBeenCalledWith(
      productId,
      expect.objectContaining({
        includeFinancial: true,
        includeRecentInvoices: true,
        recentInvoiceLimit: 10,
        recentInvoiceOffset: 20,
      }),
      true,
    )
    expect(screen.getByRole('link', { name: 'INV-26-001' })).toHaveAttribute(
      'href',
      `/invoices/${invoiceId}`,
    )
  })

  it('keeps category detail available without product-read permission', () => {
    mocks.permissions.add('categories.read')
    visit(`/products/categories/${categoryId}`, <CategoryDetailPage />)
    expect(screen.getByRole('heading', { name: 'Nuts' })).toBeInTheDocument()
    expect(mocks.useCategoryInsight).toHaveBeenCalledWith(
      categoryId,
      expect.objectContaining({ includeFinancial: false, sortBy: 'name' }),
      false,
    )
    expect(screen.queryByText('Linked products')).not.toBeInTheDocument()
  })
})
