import { documentTitle } from '../../../../../lib/documents/document-title.js'
import { renderDocument } from '../../../../../lib/documents/render-document.js'
import {
  type DocumentImages,
  issuerParty,
  party,
  record,
  text,
} from '../../../../../lib/documents/types.js'
import { displayNumber } from '../../../../../lib/number-format.js'
import type {
  EstimateLineRow,
  EstimateRow,
} from '../../estimates/repositories/estimate.repository.js'
import type { InvoiceLineRow, InvoiceRow } from '../../invoices/repositories/invoice.repository.js'

export async function renderSalesPdf(
  row: EstimateRow | InvoiceRow,
  lines: EstimateLineRow[] | InvoiceLineRow[],
  title: 'ESTIMATE' | 'INVOICE',
  images: DocumentImages = {},
) {
  const appearance = record(row.appearanceSnapshot)
  const issuer = record(row.issuerSnapshot)
  const exempt = issuer.vatRegime === 'exempt' && Number(row.taxTotal) === 0
  const simple = 'kind' in row && row.kind === 'simple'
  const english = text(issuer.locale).startsWith('en') || text(row.locale).startsWith('en')
  const vat = !exempt && lines.some((line) => line.vatRate !== null)
  const bank = record('bankDetailsSnapshot' in row ? row.bankDetailsSnapshot : null)
  const result = await renderDocument(
    {
      locale: row.locale,
      title: documentTitle(
        title === 'INVOICE' ? (simple ? 'simple_invoice' : 'invoice') : 'estimate',
        row.locale,
      ),
      number: row.number ?? '',
      issuer: issuerParty(row.issuerSnapshot),
      client: party(row.clientSnapshot),
      date: row.issueDate,
      reference: [
        title === 'INVOICE' ? 'Due date' : 'Valid until',
        'validUntil' in row ? (row.validUntil ?? '') : (row.dueDate ?? ''),
      ],
      lines: lines.map((line) => ({
        name:
          line.productName +
          (line.packageWeightG ? ` · ${displayNumber(line.packageWeightG)} g` : ''),
        quantity: String(line.quantity),
        price: line.unitPrice,
        total: line.totalAmount,
        ...(vat ? { vat: line.vatRate === null ? '-' : `${line.vatRate}%` } : {}),
      })),
      totals: [
        ...(vat
          ? ([
              ['Subtotal', `${row.subtotal} ${row.currency}`],
              ['VAT', `${row.taxTotal} ${row.currency}`],
            ] as [string, string][])
          : []),
        ['Total', `${row.total} ${row.currency}`],
      ],
      sections: [
        ...(simple
          ? [
              {
                title: 'Simple invoice',
                text: english
                  ? 'This document is not a legal tax invoice.'
                  : 'Ce document n’est pas une facture fiscale légale.',
              },
            ]
          : []),
        ...(exempt && text(issuer.vatExemptionMention).trim()
          ? [{ title: 'VAT', text: text(issuer.vatExemptionMention) }]
          : []),
        ...(row.agreedPaymentMethod
          ? [
              {
                title: 'Agreed payment method',
                text:
                  row.locale === 'fr-MA'
                    ? { cash: 'Espèces', bank_transfer: 'Virement bancaire', cheque: 'Chèque' }[
                        row.agreedPaymentMethod
                      ]
                    : { cash: 'Cash', bank_transfer: 'Bank transfer', cheque: 'Cheque' }[
                        row.agreedPaymentMethod
                      ],
              },
            ]
          : []),
        ...(appearance.showPaymentTerms !== false && row.paymentTerms
          ? [{ title: 'Payment terms', text: row.paymentTerms }]
          : []),
        ...(row.notes ? [{ title: 'Notes', text: row.notes }] : []),
        ...(appearance.showBankDetails === true && Object.keys(bank).length > 0
          ? [
              {
                title: 'Bank details',
                text: [
                  bank.bankName,
                  bank.accountHolder,
                  bank.rib ? `RIB : ${text(bank.rib)}` : '',
                  bank.iban ? `IBAN : ${text(bank.iban)}` : '',
                ]
                  .map(text)
                  .filter(Boolean)
                  .join(' · '),
              },
            ]
          : []),
      ],
    },
    appearance,
    images,
  )
  return result.pdf.save()
}
