import { PaymentReceiptSnapshotSchema } from '../../../../contracts/generated/sales/payments.schemas.js'
import { documentTitle } from '../../../../lib/documents/document-title.js'
import { renderDocument } from '../../../../lib/documents/render-document.js'
import { type DocumentImages, party, record } from '../../../../lib/documents/types.js'
import type { PaymentRow } from '../repositories/payment.repository.js'

export async function renderPaymentReceiptPdf(
  row: PaymentRow,
  images: DocumentImages & { appearance: Record<string, unknown> },
) {
  const saved = PaymentReceiptSnapshotSchema.parse(row.receiptSnapshot)
  const historical =
    saved.capturedAt && saved.paidAtRecording !== null && saved.remainingAtRecording !== null
  const result = await renderDocument(
    {
      locale: String(record(saved.issuer).locale ?? 'fr-MA'),
      title: documentTitle('payment_receipt', record(saved.issuer).locale),
      number: row.number.replace(/^PAY-/, 'REC-'),
      issuer: party(saved.issuer),
      client: party(saved.client),
      date: row.paymentDate,
      reference: ['Invoice', saved.invoiceNumber],
      receipt: {
        amount: `${row.amount} ${row.currency}`,
        status:
          row.status === 'cancelled'
            ? 'CANCELLED - not valid as proof of payment'
            : row.status === 'pending'
              ? row.method === 'cheque'
                ? 'Cheque received - awaiting collection'
                : 'Bank transfer recorded - awaiting confirmation'
              : row.method === 'cheque'
                ? 'Cheque collected'
                : 'Payment collected',
        fields: [
          [
            'Method',
            row.method === 'cash' ? 'Cash' : row.method === 'cheque' ? 'Cheque' : 'Bank transfer',
          ],
          ...(row.reference ? ([['Reference', row.reference]] as [string, string][]) : []),
          ...(row.chequeBank ? ([['Cheque bank', row.chequeBank]] as [string, string][]) : []),
          ...(row.chequeNumber
            ? ([['Cheque number', row.chequeNumber]] as [string, string][])
            : []),
          ...(row.collectedOn
            ? ([['Collection date', row.collectedOn]] as [string, string][])
            : []),
        ],
        balances: [
          ['Invoice total', `${saved.invoiceTotal} ${row.currency}`],
          ...(historical
            ? ([
                ['Collected to date', `${saved.paidAtRecording} ${row.currency}`],
                ['Remaining', `${saved.remainingAtRecording} ${row.currency}`],
              ] as [string, string][])
            : []),
        ],
        note: historical
          ? `Recorded at: ${saved.capturedAt}. Historical snapshot, not the current invoice balance. Pending payments are excluded.`
          : 'Historical balance unavailable: this payment predates receipt snapshots.',
      },
      sections: [
        ...(row.status === 'cancelled'
          ? [{ title: 'Cancellation reason', text: row.cancellationReason ?? '' }]
          : []),
        ...(row.status === 'pending'
          ? [{ title: '', text: 'This receipt does not confirm cleared funds.' }]
          : []),
      ],
    },
    images.appearance,
    images,
  )
  return result.pdf.save()
}
