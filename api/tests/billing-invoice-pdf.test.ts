import { describe, expect, it } from 'vitest'

import type { InvoiceRecord } from '../src/modules/platform/subscriptions/repositories/billing-documents.repository.js'
import {
  billingInvoiceDocument,
  renderBillingInvoicePdf,
} from '../src/modules/platform/subscriptions/services/billing-invoice-pdf.service.js'

const issuer = {
  legalName: 'Slama SaaS SARL',
  address: '1 Rue Test, Casablanca',
  ice: '001234567000089',
  registrationNumber: '556677',
  taxIdentifier: '12345678',
  taxMention: 'TVA acquittée sur les débits',
  paymentTerms: 'Payable à réception',
}
const company = {
  type: 'company' as const,
  legalName: 'Atlas Distribution SARL',
  ice: '001122334455667',
  address: '25 Rue des Oliviers, Rabat',
  registrationNumber: '4455',
  taxIdentifier: null,
}
const invoice = {
  id: '11111111-1111-4111-8111-111111111111',
  ownerId: '22222222-2222-4222-8222-222222222222',
  ownerEmail: 'owner@example.test',
  kind: 'invoice',
  series: 'F',
  year: 2026,
  sequence: 7,
  number: 'F-2026-000007',
  paymentId: '33333333-3333-4333-8333-333333333333',
  correctsInvoiceId: null,
  correctsNumber: null,
  reason: null,
  currency: 'MAD',
  amountHt: 29900,
  taxRateBasisPoints: 2000,
  taxAmount: 5980,
  amountTtc: 35880,
  issuedAt: new Date('2026-05-10T23:30:00Z'),
  issuedBy: 'ops',
  customer: company,
  issuer,
  allocatedTtc: 0,
  creditedTtc: 0,
  lines: [
    {
      invoiceId: '11111111-1111-4111-8111-111111111111',
      position: 1,
      planCode: 'business',
      planVersionId: '44444444-4444-4444-8444-444444444444',
      planVersionNumber: 2,
      cycle: 'monthly',
      kind: 'activation',
      currency: 'MAD',
      amountHt: 29900,
      taxRateBasisPoints: 2000,
      taxAmount: 5980,
      amountTtc: 35880,
    },
  ],
} as InvoiceRecord

describe('platform invoice PDF', () => {
  it('prints the invoice from its snapshot in French by default', () => {
    const { model, appearance } = billingInvoiceDocument(invoice)
    expect(model).toMatchObject({ title: 'Facture', number: 'F-2026-000007', locale: 'fr-MA' })
    // Issue day in Casablanca (UTC+1 outside Ramadan).
    expect(model.date).toBe('2026-05-11')
    expect(model.issuer).toEqual([
      'Slama SaaS SARL',
      '1 Rue Test, Casablanca',
      'ICE: 001234567000089',
      'RC: 556677 · IF: 12345678',
    ])
    expect(model.client).toEqual([
      'Atlas Distribution SARL',
      '25 Rue des Oliviers, Rabat',
      'ICE: 001122334455667',
      'RC: 4455',
    ])
    expect(model.lines).toEqual([
      {
        name: 'Abonnement Business · Mensuel · v2',
        quantity: '1',
        price: '299.00',
        vat: '20%',
        total: '299.00',
      },
    ])
    expect(model.totals).toEqual([
      ['Subtotal', '299.00 MAD'],
      ['VAT', '59.80 MAD'],
      ['Total', '358.80 MAD'],
    ])
    expect(model.sections).toEqual([
      { title: '', text: 'TVA acquittée sur les débits' },
      { title: 'Payment terms', text: 'Payable à réception' },
    ])
    expect(appearance.footerText).toBe(
      'Slama SaaS SARL · ICE: 001234567000089 · RC: 556677 · IF: 12345678',
    )
  })

  it('prints a credit note with its reason and corrected invoice, in English on request', () => {
    const note = {
      ...invoice,
      kind: 'credit_note',
      number: 'A-2026-000001',
      correctsNumber: 'F-2026-000007',
      reason: 'Commercial gesture',
      // Printed from the snapshot, never from the live account e-mail.
      ownerEmail: 'changed-later@example.test',
      customer: {
        type: 'individual',
        legalName: null,
        ice: null,
        address: null,
        registrationNumber: null,
        taxIdentifier: null,
        email: 'owner@example.test',
      },
      taxRateBasisPoints: null,
      taxAmount: 0,
      amountHt: 1000,
      amountTtc: 1000,
      lines: invoice.lines.map((l) => ({ ...l, taxRateBasisPoints: null, amountHt: 1000 })),
    } as InvoiceRecord
    const { model } = billingInvoiceDocument(note, 'en')
    expect(model).toMatchObject({
      title: 'Credit note',
      reference: ['Corrects invoice', 'F-2026-000007'],
      client: ['Individual customer', 'owner@example.test'],
      totals: [['Total', '10.00 MAD']],
    })
    expect(model.lines![0]).not.toHaveProperty('vat')
    expect(model.sections![0]).toEqual({ title: 'Reason', text: 'Commercial gesture' })
    expect(billingInvoiceDocument(note).model.title).toBe('Avoir')
    expect(billingInvoiceDocument(note).model.client[0]).toBe('Client particulier')
  })

  it('renders a PDF named after the document number', async () => {
    const file = await renderBillingInvoicePdf(invoice, 'en')
    expect(file.filename).toBe('F-2026-000007-en.pdf')
    expect(Buffer.from(file.bytes.subarray(0, 5)).toString()).toBe('%PDF-')
  }, 20000)
})
