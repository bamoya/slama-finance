import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { DeliveryLinesEditor } from './delivery-lines-editor'

vi.mock('../../../products', () => ({
  useProducts: () => ({ data: [], isPending: false, isError: false }),
}))
vi.mock('../../invoices/queries', () => ({
  useInvoice: () => ({
    data: {
      lines: [
        {
          id: 'source-line',
          productVariantId: 'variant',
          productName: 'Wheat',
          packageWeightG: 500,
          quantity: 10,
        },
      ],
    },
    isPending: false,
    isError: false,
  }),
}))
const line = {
  productVariantId: null,
  sourceInvoiceLineId: null,
  productName: 'Custom item',
  quantity: 2,
}

describe('compact delivery lines', () => {
  it('keeps standalone delivery payloads free of pricing and VAT', () => {
    const onChange = vi.fn()
    render(<DeliveryLinesEditor invoiceId={null} lines={[line]} onChange={onChange} />)
    expect(screen.queryByLabelText('Unit price (MAD)')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('VAT rate')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Product name'), {
      target: { value: 'Custom delivery' },
    })
    expect(onChange).toHaveBeenCalledWith([{ ...line, productName: 'Custom delivery' }])
  })
  it('preserves source invoice links and does not offer manual products for linked notes', async () => {
    const onChange = vi.fn()
    render(<DeliveryLinesEditor invoiceId="invoice" lines={[line]} onChange={onChange} />)
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(await screen.findByRole('option', { name: /Wheat/ }))
    expect(onChange).toHaveBeenCalledWith([
      {
        ...line,
        sourceInvoiceLineId: 'source-line',
        productVariantId: 'variant',
        productName: 'Wheat',
      },
    ])
  })
})
