import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { EstimateInput } from '../../../../api/generated/schemas/sales/estimates.schemas'
import { EstimateLinesEditor } from './estimate-lines-editor'

vi.mock('../../../products', () => ({
  useProducts: () => ({
    data: [
      {
        name: 'Wheat',
        variants: [{ id: 'variant-1', weightG: 500, pricePerItem: '25.00', archivedAt: null }],
      },
    ],
    isPending: false,
    isError: false,
  }),
}))

function Harness() {
  const [lines, setLines] = useState<EstimateInput['lines']>([])
  return (
    <>
      <EstimateLinesEditor lines={lines} onChange={setLines} />
      <output data-testid="lines">{JSON.stringify(lines)}</output>
    </>
  )
}

describe('shared invoice and estimate product lines', () => {
  it('adds at the bottom, selects catalog products and supports manual document-only products', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Add product' }))
    expect(screen.getByRole('switch', { name: 'Use existing product' })).toBeChecked()
    fireEvent.click(screen.getByRole('combobox', { name: 'Product and weight' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Wheat · 500 g' }))
    expect(JSON.parse(screen.getByTestId('lines').textContent!)[0]).toMatchObject({
      productVariantId: 'variant-1',
      productName: 'Wheat',
      unitPrice: '25.00',
      vatRate: null,
    })
    fireEvent.click(screen.getByRole('switch'))
    expect(screen.queryByRole('combobox', { name: 'Product and weight' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Product name'), { target: { value: 'Custom wheat' } })
    expect(JSON.parse(screen.getByTestId('lines').textContent!)[0]).toMatchObject({
      productVariantId: null,
      productName: 'Custom wheat',
      vatRate: null,
    })
    const buttons = within(
      screen.getByRole('button', { name: 'Add product' }).closest('section')!,
    ).getAllByRole('button')
    expect(buttons.at(-1)).toHaveTextContent('Add product')
    fireEvent.click(screen.getByRole('button', { name: 'Add product' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove line 1' }))
    expect(screen.getByRole('switch')).toBeChecked()
    expect(screen.getByRole('combobox', { name: 'Product and weight' })).toBeInTheDocument()
  })
})
