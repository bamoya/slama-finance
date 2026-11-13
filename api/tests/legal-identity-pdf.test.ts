import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderDocument } from '../src/lib/documents/render-document.js'
import { issuerParty } from '../src/lib/documents/types.js'
import { renderSalesPdf } from '../src/modules/organization/sales/shared/services/sales-pdf.service.js'

vi.mock('../src/lib/documents/render-document.js', () => ({
  renderDocument: vi.fn(async () => ({ pdf: { save: async () => new Uint8Array([1]) } })),
}))
beforeEach(() => vi.clearAllMocks())
const issuer = {
  locale: 'fr-MA',
  legalName: 'Domaine Atlas SARL',
  legalType: 'sarl',
  legalForm: null,
  shareCapital: '100000.00',
  professionalTaxNumber: '4455',
  addressLine1: '12 Rue Atlas',
  city: 'Meknès',
  ice: '001122334455667',
  registrationNumber: '998877',
  registrationCity: 'Fès',
  taxIdentifier: '12345678',
  vatRegime: 'subject',
  vatExemptionMention: null,
}
const row = (over: Record<string, unknown> = {}) =>
  ({
    locale: 'fr-MA',
    number: 'FS-2026-000001',
    issueDate: '2026-10-02',
    dueDate: '2026-10-17',
    currency: 'MAD',
    subtotal: '100.00',
    taxTotal: '0.00',
    total: '100.00',
    issuerSnapshot: issuer,
    clientSnapshot: {},
    appearanceSnapshot: {},
    kind: 'legal',
    ...over,
  }) as never
const line = (vatRate: string | null) =>
  [
    {
      productName: 'Blé',
      quantity: 1,
      unitPrice: '100.00',
      totalAmount: '100.00',
      vatRate,
      packageWeightG: null,
    },
  ] as never
const model = () => vi.mocked(renderDocument).mock.calls[0]![0]

describe('legal identity on sales PDFs', () => {
  it('prints legal form, capital, RC, IF and TP for a company', () => {
    const lines = issuerParty(issuer)
    expect(lines.find((l) => l.startsWith('SARL'))).toMatch(/^SARL · Capital: 100\s000,00 MAD$/u)
    expect(lines).toContain('RC: 998877 (Fès) · IF: 12345678 · TP: 4455')
  })
  it('prefers the free legal form text and localizes the English label', () => {
    expect(
      issuerParty({ ...issuer, legalForm: 'SARL au capital variable' }).find((l) =>
        l.startsWith('SARL au capital variable'),
      ),
    ).toMatch(/^SARL au capital variable · Capital: 100\s000,00 MAD$/u)
    expect(
      issuerParty({ ...issuer, locale: 'en-GB', shareCapital: null, legalType: 'sole_trader' }),
    ).toContain('Sole trader')
    expect(issuerParty({ ...issuer, legalType: 'individual', shareCapital: null })).not.toContain(
      'SARL',
    )
  })
  it('titles a simple invoice and labels it as not a legal tax invoice', async () => {
    await renderSalesPdf(row({ kind: 'simple' }), line(null), 'INVOICE')
    expect(model().title).toBe('Facture simple')
    expect(model().sections).toContainEqual({
      title: 'Simple invoice',
      text: expect.stringContaining('pas une facture fiscale légale'),
    })
    vi.clearAllMocks()
    await renderSalesPdf(
      row({ kind: 'simple', locale: 'en-GB', issuerSnapshot: { ...issuer, locale: 'en-GB' } }),
      line(null),
      'INVOICE',
    )
    expect(model().title).toBe('Simple invoice')
    expect(JSON.stringify(model().sections)).toContain('not a legal tax invoice')
  })
  it('keeps legal invoices and estimates unlabelled', async () => {
    await renderSalesPdf(row(), line(null), 'INVOICE')
    expect(model().title).toBe('Facture')
    expect(JSON.stringify(model().sections)).not.toContain('Simple invoice')
  })
  it('prints the exemption mention and hides the VAT column for an exempt company', async () => {
    const exempt = { ...issuer, vatRegime: 'exempt', vatExemptionMention: 'TVA non applicable' }
    await renderSalesPdf(row({ issuerSnapshot: exempt }), line(null), 'INVOICE')
    expect(model().sections).toContainEqual({ title: 'VAT', text: 'TVA non applicable' })
    expect(model().lines![0]).not.toHaveProperty('vat')
    expect(model().totals).toEqual([['Total', '100.00 MAD']])
  })
  it('formats the share capital with the currency in English and skips a zero capital', () => {
    const english = issuerParty({ ...issuer, locale: 'en-GB', currency: 'EUR' })
    expect(english.find((l) => l.startsWith('SARL'))).toMatch(
      /^SARL · Share capital: 100[\s,\u202f]000\.00 EUR$/u,
    )
    expect(issuerParty({ ...issuer, shareCapital: '0.00' }).join('|')).not.toContain('Capital')
  })
  it('keeps the VAT breakdown of a historical exempt-company document that carries tax', async () => {
    const exempt = { ...issuer, vatRegime: 'exempt', vatExemptionMention: 'TVA non applicable' }
    await renderSalesPdf(
      row({ issuerSnapshot: exempt, taxTotal: '20.00', total: '120.00' }),
      line('20.00'),
      'ESTIMATE' as never,
    )
    expect(model().lines![0]).toHaveProperty('vat', '20.00%')
    expect(model().totals).toContainEqual(['VAT', '20.00 MAD'])
    expect(model().sections!.some((s) => s.title === 'VAT')).toBe(false)
  })
  it('prints no mention for a company subject to VAT', async () => {
    await renderSalesPdf(row(), line('20.00'), 'INVOICE')
    expect(model().sections!.some((s) => s.title === 'VAT')).toBe(false)
    expect(model().lines![0]).toHaveProperty('vat', '20.00%')
  })
})
