import { describe, expect, it } from 'vitest'

import type { InvoiceCreditableLine } from '../../../../../api/generated/models'
import { creditPreview, draftAmounts, draftIssue } from './credit-line-drafts'

const line: InvoiceCreditableLine = {
  invoiceLineId: 'line',
  position: 1,
  productName: 'Item',
  productReference: null,
  vatRate: '7.00',
  unitPrice: '33.33',
  quantity: 3,
  netAmount: '99.99',
  taxAmount: '7.00',
  totalAmount: '106.99',
  creditedQuantity: 2,
  creditedNetAmount: '66.66',
  creditedTaxAmount: '4.66',
  creditedTotalAmount: '71.32',
  remainingQuantity: 1,
  remainingNetAmount: '33.33',
  remainingTaxAmount: '2.34',
  remainingTotalAmount: '35.67',
}
const quantity = (value: string) => ({ selected: true, mode: 'quantity' as const, value })

describe('credit line calculations', () => {
  it('uses the remaining VAT for the last of three rounded quantity credits', () => {
    expect(creditPreview([line], { line: quantity('1') })).toEqual({
      net: '33.33',
      tax: '2.34',
      total: '35.67',
    })
  })

  it('caps non-exhausting VAT at the remaining VAT', () => {
    const capped = {
      ...line,
      remainingQuantity: 2,
      remainingNetAmount: '66.66',
      remainingTaxAmount: '1.00',
    }
    expect(draftAmounts(capped, quantity('1'))).toEqual({ net: 3333, tax: 100 })
  })

  it('clamps a full quantity after an amount credit and rejects an excessive partial quantity', () => {
    const corrected = {
      ...line,
      unitPrice: '50.00',
      remainingQuantity: 3,
      remainingNetAmount: '89.90',
      remainingTaxAmount: '6.29',
    }
    expect(draftIssue(corrected, quantity('3'))).toBeNull()
    expect(draftAmounts(corrected, quantity('3'))).toEqual({ net: 8990, tax: 629 })
    expect(draftIssue(corrected, quantity('2'))).not.toBeNull()
  })

  it('accepts a free item by quantity', () => {
    const free = {
      ...line,
      unitPrice: '0.00',
      remainingNetAmount: '0.00',
      remainingTaxAmount: '0.00',
    }
    expect(draftIssue(free, quantity('1'))).toBeNull()
    expect(draftAmounts(free, quantity('1'))).toEqual({ net: 0, tax: 0 })
  })
})
