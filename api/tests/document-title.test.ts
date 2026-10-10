import { describe, expect, it } from 'vitest'

import { documentTitle } from '../src/lib/documents/document-title.js'

describe('document titles', () => {
  it('uses French titles for every document by default and for Moroccan French', () => {
    for (const [kind, title] of Object.entries({
      invoice: 'Facture',
      estimate: 'Devis',
      delivery: 'Bon de livraison',
      payment_receipt: 'Reçu de paiement',
    })) {
      expect(documentTitle(kind as Parameters<typeof documentTitle>[0])).toBe(title)
      expect(documentTitle(kind as Parameters<typeof documentTitle>[0], 'fr-MA')).toBe(title)
    }
  })
  it('respects English and Arabic document locales', () => {
    expect(documentTitle('estimate', 'en-GB')).toBe('Estimate')
    expect(documentTitle('invoice', 'ar-MA')).toBe('فاتورة')
  })
})
