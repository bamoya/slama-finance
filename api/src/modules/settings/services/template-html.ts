import type {
  CreateDocumentTemplate,
  PreviewDocumentTemplateQuery,
} from '../../../contracts/generated/settings/settings.schemas.js'
import { documentTitle } from '../../../lib/documents/document-title.js'
import { renderDocument } from '../../../lib/documents/render-document.js'
import type { DocumentImages, DocumentModel } from '../../../lib/documents/types.js'

export async function renderTemplatePreview(
  data: CreateDocumentTemplate,
  kind: PreviewDocumentTemplateQuery['documentType'],
  images: DocumentImages = {},
  sampleSize: PreviewDocumentTemplateQuery['sampleSize'] = 'short',
  locale = 'fr-MA',
) {
  const delivery = kind === 'delivery'
  const receipt = kind === 'payment_receipt'
  const many = sampleSize === 'many'
  const model: DocumentModel = {
    locale: locale,
    title: documentTitle(kind, locale),
    number: receipt ? 'REC-2026-3188460612' : 'SAMPLE-2026-A7K9M2',
    issuer: [
      'Sample company',
      '12 Avenue Hassan II, Casablanca',
      'ICE: 001234567890123',
      'contact@example.ma · +212 522 00 00 00',
    ],
    client: ['Sample customer', '25 Rue des Oliviers, Rabat', 'ICE: 002345678901234'],
    date: '2026-10-02',
    reference: receipt
      ? ['Invoice', 'FAC-2026-4919302341']
      : [kind === 'estimate' ? 'Valid until' : 'Due date', '2026-11-01'],
    sections: [],
  }
  if (receipt) {
    model.receipt = {
      amount: '1500.00 MAD',
      status: 'Cheque received - awaiting collection',
      fields: [
        ['Method', 'Cheque'],
        ['Cheque bank', 'Attijariwafa Bank'],
        ['Cheque number', 'CHQ-10292026'],
        ['Collection date', 'Awaiting collection'],
      ],
      balances: [
        ['Invoice total', '4500.00 MAD'],
        ['Collected to date', '1000.00 MAD'],
        ['Remaining', '3500.00 MAD'],
      ],
      note: 'Recorded at: 2026-10-02T10:00:00.000Z. Historical snapshot, not the current invoice balance. Pending payments are excluded.',
    }
    model.sections = [{ title: '', text: 'This receipt does not confirm cleared funds.' }]
  } else {
    if (delivery) model.reference = undefined
    model.lines = Array.from({ length: many ? 45 : 3 }, (_, index) => ({
      name:
        ['Wheat · 500 g', 'Flour · 1 kg', 'Semolina · 200 g'][index % 3]! +
        (many ? ` · Item ${index + 1}` : ''),
      quantity: many ? '5' : String([10, 5, 20][index]!),
      ...(!delivery
        ? { price: '20.00', total: many ? '100.00' : ['200.00', '100.00', '400.00'][index]! }
        : {}),
    }))
    if (!delivery) {
      model.totals = [['Total', many ? '4500.00 MAD' : '700.00 MAD']]
      if (data.showPaymentTerms && data.paymentTerms)
        model.sections!.push({ title: 'Payment terms', text: data.paymentTerms })
      if (data.showBankDetails)
        model.sections!.push({
          title: 'Bank details',
          text: 'Bank details from the selected account',
        })
    }
    model.receptionSignature = delivery
  }
  const { html, pageCount } = await renderDocument(model, data, images)
  return { html, pageCount }
}
