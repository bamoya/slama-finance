import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CatalogBulkActions } from './catalog-bulk-actions'

const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), refresh: vi.fn(), can: vi.fn() }))
vi.mock('../../identity', () => ({ useAuthorization: () => ({ can: mocks.can }) }))
vi.mock('../queries', () => ({
  getProductForUpdate: mocks.get,
  refreshCatalog: mocks.refresh,
  useCategories: () => ({ data: [], isFetching: false, isError: false }),
  useCatalogActions: () => ({ updateProduct: mocks.update }),
}))
const id = '11111111-1111-4111-8111-111111111111'
const variantId = '22222222-2222-4222-8222-222222222222'
const product = {
  id,
  name: 'Wheat',
  reference: 'W-1',
  description: 'Keep description',
  categoryId: variantId,
  imageAssetId: null,
  suggestedVatRate: null,
  version: 1,
  archivedAt: null,
  variants: [
    { id: variantId, weightG: 200, pricePerItem: '20.00', costPerItem: '10.00', archivedAt: null },
    {
      id: '33333333-3333-4333-8333-333333333333',
      weightG: 500,
      pricePerItem: '40.00',
      costPerItem: null,
      archivedAt: '2026-01-01T00:00:00Z',
    },
  ],
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.can.mockImplementation((permission: string) =>
    ['products.update', 'categories.read'].includes(permission),
  )
  mocks.get.mockResolvedValue(product)
  mocks.update.mockResolvedValue(product)
  mocks.refresh.mockResolvedValue(undefined)
})
function visit() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CatalogBulkActions resource="products" selected={[product]} clear={vi.fn()} />
    </QueryClientProvider>,
  )
}
async function choose() {
  fireEvent.click(screen.getByRole('button', { name: 'Change category' }))
  fireEvent.click(screen.getByRole('combobox', { name: 'Choose a category' }))
  fireEvent.click(await screen.findByRole('option', { name: 'Uncategorized' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
}
describe('Bulk product category changes', () => {
  it('preserves product fields and every variant, including archived variants', async () => {
    visit()
    await choose()
    await screen.findByText('1 succeeded · 0 skipped · 0 failed')
    expect(mocks.update).toHaveBeenCalledWith(id, {
      name: 'Wheat',
      reference: 'W-1',
      description: 'Keep description',
      categoryId: null,
      imageAssetId: null,
      suggestedVatRate: null,
      expectedVersion: 1,
      variants: [
        { id: variantId, weightG: 200, pricePerItem: '20.00', costPerItem: '10.00', active: true },
        {
          id: '33333333-3333-4333-8333-333333333333',
          weightG: 500,
          pricePerItem: '40.00',
          costPerItem: null,
          active: false,
        },
      ],
    })
  })
  it('does not overwrite a product changed after selection', async () => {
    mocks.get.mockResolvedValue({ ...product, version: 2 })
    visit()
    await choose()
    await screen.findByText('0 succeeded · 0 skipped · 1 failed')
    expect(mocks.update).not.toHaveBeenCalled()
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled())
  })
  it('hides actions without permission', () => {
    mocks.can.mockReturnValue(false)
    visit()
    expect(screen.queryByRole('button', { name: 'Change category' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })
})
