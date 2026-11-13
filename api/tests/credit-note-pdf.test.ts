import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderDocument } from '../src/lib/documents/render-document.js'
import { renderCreditNotePdf } from '../src/modules/organization/sales/credit-notes/services/credit-note-pdf.service.js'

vi.mock('../src/lib/documents/render-document.js', () => ({
  renderDocument: vi.fn(async () => ({ pdf: { save: async () => new Uint8Array([1]) } })),
}))
beforeEach(() => vi.clearAllMocks())

const issuer = {
  locale: 'fr-MA',
  legalName: 'Domaine Atlas',
  legalType: 'auto_entrepreneur',
  addressLine1: '12 Rue Atlas',
  city: 'Meknès',
  ice: '001122334455667',
  vatRegime: 'subject',
  vatExemptionMention: null,
}
const row = (over: Record<string, unknown> = {}) =>
  ({
    locale: 'fr-MA',
    number: 'AVO-2026-000001',
    kind: 'legal',
    issueDate: '2026-10-05',
    invoiceNumber: 'FAC-2026-000007',
    invoiceIssueDate: '2026-10-02',
    reason: 'Marchandise retournée',
    currency: 'MAD',
    subtotal: '100.00',
    taxTotal: '20.00',
    total: '120.00',
    issuerSnapshot: issuer,
    clientSnapshot: { legalName: 'Atlas SARL' },
    appearanceSnapshot: {},
    bankDetailsSnapshot: null,
    ...over,
  }) as never
const lines = [
  { productName: 'Blé', quantity: 1, unitPrice: '100.00', vatRate: '20.00', totalAmount: '120.00' },
] as never

const model = () => vi.mocked(renderDocument).mock.calls[0]![0]

describe('credit note PDF', () => {
  it('prints Avoir, the corrected invoice reference, the reason and VAT totals from the snapshot', async () => {
    await renderCreditNotePdf(row(), lines)
    expect(model()).toMatchObject({
      title: 'Avoir',
      number: 'AVO-2026-000001',
      date: '2026-10-05',
      totals: [
        ['Subtotal', '100.00 MAD'],
        ['VAT', '20.00 MAD'],
        ['Total', '120.00 MAD'],
      ],
    })
    expect(model().sections).toEqual(
      expect.arrayContaining([
        { title: 'Corrects invoice', text: 'N° FAC-2026-000007 · 02-10-2026' },
        { title: 'Reason', text: 'Marchandise retournée' },
      ]),
    )
    expect(model().sections?.some((s) => s.title === 'Simple credit note')).toBe(false)
  })

  it('labels a simple credit note and prints the exemption mention only for exempt issuers', async () => {
    await renderCreditNotePdf(
      row({
        kind: 'simple',
        number: 'AVS-2026-000001',
        taxTotal: '0.00',
        total: '100.00',
        issuerSnapshot: {
          ...issuer,
          vatRegime: 'exempt',
          vatExemptionMention: 'TVA non applicable',
        },
      }),
      [{ ...(lines as never as object[])[0], vatRate: null }] as never,
    )
    expect(model().title).toBe('Avoir simple')
    expect(model().totals).toEqual([['Total', '100.00 MAD']])
    expect(model().sections).toEqual(
      expect.arrayContaining([
        { title: 'Simple credit note', text: 'Ce document n’est pas un avoir fiscal légal.' },
        { title: 'VAT', text: 'TVA non applicable' },
      ]),
    )
  })

  it('uses English wording for an English document', async () => {
    await renderCreditNotePdf(
      row({ locale: 'en-GB', kind: 'simple', issuerSnapshot: { ...issuer, locale: 'en-GB' } }),
      lines,
    )
    expect(model().title).toBe('Simple credit note')
  })
})
