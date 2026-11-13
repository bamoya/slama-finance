import { displayDate } from '../../../../../lib/documents/display-date.js'
import { documentTitle } from '../../../../../lib/documents/document-title.js'
import { renderDocument } from '../../../../../lib/documents/render-document.js'
import {
  type DocumentImages,
  issuerParty,
  party,
  record,
  text,
} from '../../../../../lib/documents/types.js'
import type { CreditNoteLineRow, CreditNoteRow } from '../repositories/credit-note.repository.js'

/**
 * Renders a credit note from its stored snapshots only (copied from the credited invoice): issuer, client, bank,
 * appearance, the invoice number/date and the reason. Nothing is read from live company or client data, so
 * regeneration can never change what was issued. Simple credit notes carry the same "not a legal document" label
 * as simple invoices, and an exempt issuer prints its VAT exemption mention.
 */
export async function renderCreditNotePdf(
  row: CreditNoteRow,
  lines: CreditNoteLineRow[],
  images: DocumentImages = {},
) {
  const appearance = record(row.appearanceSnapshot)
  const issuer = record(row.issuerSnapshot)
  const exempt = issuer.vatRegime === 'exempt' && Number(row.taxTotal) === 0
  const simple = row.kind === 'simple'
  const english = text(issuer.locale).startsWith('en') || row.locale.startsWith('en')
  const vat = !exempt && lines.some((line) => line.vatRate !== null)
  const bank = record(row.bankDetailsSnapshot)
  const result = await renderDocument(
    {
      locale: row.locale,
      title: documentTitle(simple ? 'simple_credit_note' : 'credit_note', row.locale),
      number: row.number ?? '',
      issuer: issuerParty(row.issuerSnapshot),
      client: party(row.clientSnapshot),
      date: row.issueDate ?? '',
      lines: lines.map((line) => ({
        name:
          line.productName +
          (line.quantity === 0 ? ` (${english ? 'amount credited' : 'montant crédité'})` : ''),
        quantity: line.quantity === 0 ? '-' : String(line.quantity),
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
        {
          title: 'Corrects invoice',
          text: `N° ${row.invoiceNumber} · ${displayDate(row.invoiceIssueDate)}`,
        },
        { title: 'Reason', text: row.reason },
        ...(simple
          ? [
              {
                title: 'Simple credit note',
                text: english
                  ? 'This document is not a legal tax credit note.'
                  : 'Ce document n’est pas un avoir fiscal légal.',
              },
            ]
          : []),
        ...(exempt && text(issuer.vatExemptionMention).trim()
          ? [{ title: 'VAT', text: text(issuer.vatExemptionMention) }]
          : []),
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
