import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderDocument } from '../src/lib/documents/render-document.js'
import { issuerParty } from '../src/lib/documents/types.js'
import type { PaymentRow } from '../src/modules/organization/sales/payments/repositories/payment.repository.js'
import { renderPaymentReceiptPdf } from '../src/modules/organization/sales/payments/services/payment-receipt-pdf.service.js'
import { renderDeliveryPdf } from '../src/modules/organization/sales/shared/services/delivery-pdf.service.js'
import { renderSalesPdf } from '../src/modules/organization/sales/shared/services/sales-pdf.service.js'

vi.mock('../src/lib/documents/render-document.js', () => ({
  renderDocument: vi.fn(async () => ({ pdf: { save: async () => new Uint8Array([1]) } })),
}))
beforeEach(() => vi.clearAllMocks())
const issuer = {
  locale: 'fr-MA',
  legalName: 'Domaine Atlas SARL',
  addressLine1: '12 Rue Atlas',
  city: 'Meknès',
  ice: '001122334455667',
  registrationNumber: '998877',
  registrationCity: 'Fès',
  taxIdentifier: '12345678',
}
const expectedLine = 'RC: 998877 (Fès) · IF: 12345678'
const issuerLines = () => vi.mocked(renderDocument).mock.calls[0]![0].issuer

describe('issuer fiscal identity on issued PDFs', () => {
  it('places RC (with city) and IF right after ICE', () => {
    const lines = issuerParty(issuer)
    expect(lines).toContain('12 Rue Atlas, Meknès')
    expect(lines.indexOf(expectedLine)).toBe(lines.indexOf('ICE: 001122334455667') + 1)
  })
  it('omits missing RC and IF and the registration city without RC', () => {
    const lines = issuerParty({ ...issuer, registrationNumber: null, taxIdentifier: null })
    expect(lines.join('\n')).not.toMatch(/RC:|IF:/)
    expect(issuerParty({ ...issuer, taxIdentifier: null, registrationCity: null })).toContain(
      'RC: 998877',
    )
  })
  it.each(['ESTIMATE', 'INVOICE'] as const)('prints RC and IF on a %s', async (kind) => {
    await renderSalesPdf(
      { issuerSnapshot: issuer, clientSnapshot: {}, appearanceSnapshot: {} } as never,
      [],
      kind,
    )
    expect(issuerLines()).toContain(expectedLine)
  })
  it('prints RC and IF on a delivery note', async () => {
    await renderDeliveryPdf(
      { issuerSnapshot: issuer, clientSnapshot: {}, appearanceSnapshot: {} } as never,
      [],
    )
    expect(issuerLines()).toContain(expectedLine)
  })
  it('prints RC and IF on a payment receipt', async () => {
    await renderPaymentReceiptPdf(
      {
        number: 'PAY-2026-1',
        amount: '10.00',
        currency: 'MAD',
        paymentDate: '2026-10-02',
        method: 'cash',
        status: 'confirmed',
        receiptSnapshot: {
          invoiceNumber: 'FAC-1',
          invoiceTotal: '10.00',
          issuer,
          client: {},
          appearance: {},
          templateId: null,
          capturedAt: null,
          paidAtRecording: null,
          remainingAtRecording: null,
        },
      } as unknown as PaymentRow,
      { appearance: {} },
    )
    expect(issuerLines()).toContain(expectedLine)
  })
})
