import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderDocument } from '../src/lib/documents/render-document.js'
import type { EstimateRow } from '../src/modules/sales/estimates/repositories/estimate.repository.js'
import { renderSalesPdf } from '../src/modules/sales/shared/services/sales-pdf.service.js'

vi.mock('../src/lib/documents/render-document.js', () => ({
  renderDocument: vi.fn(async () => ({ pdf: { save: async () => new Uint8Array([1]) } })),
}))
beforeEach(() => vi.clearAllMocks())
const record = (overrides: object = {}) =>
  ({
    locale: 'fr-MA',
    number: 'DEV-2026-1234567890',
    issuerSnapshot: {},
    clientSnapshot: {},
    issueDate: '2026-10-13',
    validUntil: null,
    notes: null,
    paymentTerms: null,
    total: '100.00',
    currency: 'MAD',
    appearanceSnapshot: { showBankDetails: true },
    agreedPaymentMethod: 'bank_transfer',
    bankDetailsSnapshot: {
      bankName: 'Crédit Agricole',
      accountHolder: 'Slama',
      rib: '225091032701984651012213',
      iban: null,
    },
    ...overrides,
  }) as unknown as EstimateRow
describe('document payment agreement rendering', () => {
  it.each(['ESTIMATE', 'INVOICE'] as const)(
    'prints the agreed method and selected bank for %s',
    async (kind) => {
      await renderSalesPdf(record(), [], kind)
      const sections = vi.mocked(renderDocument).mock.calls[0]![0].sections
      expect(sections).toEqual(
        expect.arrayContaining([
          { title: 'Agreed payment method', text: 'Virement bancaire' },
          {
            title: 'Bank details',
            text: 'Crédit Agricole · Slama · RIB : 225091032701984651012213',
          },
        ]),
      )
    },
  )
  it('uses English for the agreement without translating bank identity', async () => {
    await renderSalesPdf(record({ locale: 'en-GB' }), [], 'INVOICE')
    expect(vi.mocked(renderDocument).mock.calls[0]![0].sections).toContainEqual({
      title: 'Agreed payment method',
      text: 'Bank transfer',
    })
  })
  it.each([
    { bankDetailsSnapshot: null, agreedPaymentMethod: null },
    { appearanceSnapshot: { showBankDetails: false }, agreedPaymentMethod: null },
  ])('omits hidden or missing bank details and an unspecified agreement', async (overrides) => {
    await renderSalesPdf(record(overrides), [], 'ESTIMATE')
    expect(vi.mocked(renderDocument).mock.calls[0]![0].sections).toEqual([])
  })
})
