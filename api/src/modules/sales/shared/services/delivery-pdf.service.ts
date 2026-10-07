import { renderDocument } from '../../../../lib/documents/render-document.js'
import { type DocumentImages, party } from '../../../../lib/documents/types.js'
import type {
  DeliveryLineRow,
  DeliveryNoteRow,
} from '../../delivery-notes/repositories/delivery-note.repository.js'

export async function renderDeliveryPdf(
  row: DeliveryNoteRow,
  lines: DeliveryLineRow[],
  images: DocumentImages & { appearance?: Record<string, unknown> } = {},
) {
  const result = await renderDocument(
    {
      title: 'Delivery note',
      number: row.number ?? '',
      issuer: party(row.issuerSnapshot),
      client: [party(row.clientSnapshot)[0] ?? '', row.deliveryAddress],
      date: row.deliveryDate,
      lines: lines.map((line) => ({
        name: line.productName + (line.packageWeightG ? ` · ${line.packageWeightG} g` : ''),
        quantity: String(line.quantity),
      })),
      sections: row.instructions ? [{ title: 'Instructions', text: row.instructions }] : [],
      receptionSignature: row.includeReceptionSignature,
    },
    images.appearance ?? {},
    images,
  )
  return result.pdf.save()
}
