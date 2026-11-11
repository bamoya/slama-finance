import { documentLabel } from '../../../../lib/documents/document-labels.js'
import { documentTitle } from '../../../../lib/documents/document-title.js'
import { renderDocument } from '../../../../lib/documents/render-document.js'
import { type DocumentModel, issuerParty } from '../../../../lib/documents/types.js'
import type { InvoiceRecord } from '../repositories/billing-documents.repository.js'
import { billingDay } from './billing-calendar.service.js'

const amount = (centimes: number) =>
  `${centimes < 0 ? '-' : ''}${Math.floor(Math.abs(centimes) / 100)}.${String(Math.abs(centimes) % 100).padStart(2, '0')}`
const planName = (code: string) => code.charAt(0).toUpperCase() + code.slice(1)

/**
 * Presentation model of a platform invoice or credit note, built only from its immutable snapshot
 * (amounts, lines, customer and issuer at issue). French unless `language` is en.
 */
export function billingInvoiceDocument(row: InvoiceRecord, language: 'fr' | 'en' = 'fr') {
  const locale = language === 'en' ? 'en-GB' : 'fr-MA'
  const label = (value: string) => documentLabel(value, locale)
  const credit = row.kind === 'credit_note'
  const issuer = row.issuer
  const customer = row.customer
  const money = (centimes: number) => `${amount(centimes)} ${row.currency}`
  const vat = row.taxRateBasisPoints !== null
  const model: DocumentModel = {
    locale,
    title: documentTitle(credit ? 'credit_note' : 'invoice', locale),
    number: row.number,
    issuer: issuerParty({
      legalName: issuer.legalName,
      addressLine1: issuer.address,
      ice: issuer.ice,
      registrationNumber: issuer.registrationNumber,
      taxIdentifier: issuer.taxIdentifier,
    }),
    client:
      customer.type === 'company'
        ? issuerParty({
            legalName: customer.legalName,
            addressLine1: customer.address,
            ice: customer.ice,
            registrationNumber: customer.registrationNumber,
            taxIdentifier: customer.taxIdentifier,
          })
        : [label('Individual customer'), ...(customer.email ? [customer.email] : [])],
    date: billingDay(row.issuedAt),
    ...(credit && row.correctsNumber
      ? { reference: ['Corrects invoice', row.correctsNumber] as [string, string] }
      : {}),
    lines: row.lines.map((line) => ({
      name: `${label('Subscription')} ${planName(line.planCode)} · ${label(line.cycle === 'annual' ? 'Annual' : 'Monthly')} · v${line.planVersionNumber}`,
      quantity: '1',
      price: amount(line.amountHt),
      ...(vat ? { vat: `${(line.taxRateBasisPoints ?? 0) / 100}%` } : {}),
      total: amount(line.amountHt),
    })),
    totals: [
      ...(vat
        ? ([
            ['Subtotal', money(row.amountHt)],
            ['VAT', money(row.taxAmount)],
          ] as [string, string][])
        : []),
      ['Total', money(row.amountTtc)],
    ],
    sections: [
      ...(credit && row.reason ? [{ title: 'Reason', text: row.reason }] : []),
      ...(issuer.taxMention ? [{ title: '', text: issuer.taxMention }] : []),
      ...(issuer.paymentTerms ? [{ title: 'Payment terms', text: issuer.paymentTerms }] : []),
    ],
  }
  // Legal footer from the issuer snapshot.
  const footerText = [
    issuer.legalName,
    issuer.ice && `ICE: ${issuer.ice}`,
    issuer.registrationNumber && `RC: ${issuer.registrationNumber}`,
    issuer.taxIdentifier && `IF: ${issuer.taxIdentifier}`,
  ]
    .filter(Boolean)
    .join(' · ')
  return { model, appearance: { layout: 'classic', footerText } }
}

export async function renderBillingInvoicePdf(row: InvoiceRecord, language: 'fr' | 'en' = 'fr') {
  const { model, appearance } = billingInvoiceDocument(row, language)
  const result = await renderDocument(model, appearance)
  return {
    bytes: await result.pdf.save(),
    filename: `${row.number}${language === 'en' ? '-en' : ''}.pdf`,
  }
}
