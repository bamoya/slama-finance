import type {
  CreateDocumentTemplate,
  PreviewDocumentTemplateQuery,
} from '../../../../contracts/generated/settings/settings.schemas.js'
import { documentTitle } from '../../../../lib/documents/document-title.js'
import { renderDocument } from '../../../../lib/documents/render-document.js'
import { type DocumentImages, type DocumentModel, party } from '../../../../lib/documents/types.js'

/** Organization data the preview shows instead of invented values. */
export type TemplatePreviewProfile = {
  company?: {
    legalName: string | null
    tradeName: string | null
    addressLine1: string | null
    addressLine2: string | null
    city: string | null
    postalCode: string | null
    ice: string | null
    taxIdentifier: string | null
    registrationNumber: string | null
    registrationCity: string | null
    email: string | null
    phone: string | null
    currency: string
  }
  bank?: {
    bankName: string
    accountHolder: string
    rib: string | null
    iban: string | null
  } | null
}

const sampleProducts = {
  fr: ['Huile d’olive · 1 L', 'Miel d’oranger · 500 g', 'Couscous · 1 kg'],
  en: ['Olive oil · 1 L', 'Orange blossom honey · 500 g', 'Couscous · 1 kg'],
}

function issuerLines(profile: TemplatePreviewProfile, locale: string) {
  const company = profile.company
  if (!company) return [locale === 'en-GB' ? 'Your company' : 'Votre entreprise']
  const lines = party({ ...company, legalName: company.legalName || company.tradeName })
  const fiscal = [
    company.registrationNumber
      ? `RC: ${company.registrationNumber}${company.registrationCity ? ` (${company.registrationCity})` : ''}`
      : '',
    company.taxIdentifier ? `IF: ${company.taxIdentifier}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
  if (fiscal)
    lines.splice(
      Math.min(lines.length, lines.findIndex((l) => l.startsWith('ICE:')) + 1 || lines.length),
      0,
      fiscal,
    )
  return lines
}

export async function renderTemplatePreview(
  data: CreateDocumentTemplate,
  kind: PreviewDocumentTemplateQuery['documentType'],
  images: DocumentImages = {},
  sampleSize: PreviewDocumentTemplateQuery['sampleSize'] = 'short',
  locale = 'fr-MA',
  profile: TemplatePreviewProfile = {},
) {
  const english = locale === 'en-GB'
  const currency = profile.company?.currency ?? 'MAD'
  const delivery = kind === 'delivery'
  const receipt = kind === 'payment_receipt'
  const many = sampleSize === 'many'
  const model: DocumentModel = {
    locale: locale,
    title: documentTitle(kind, locale),
    number: receipt ? 'REC-2026-3188460612' : 'SAMPLE-2026-A7K9M2',
    issuer: issuerLines(profile, locale),
    client: [
      english ? 'Sample customer' : 'Client exemple',
      '25 Rue des Oliviers, Rabat',
      'ICE: 002345678901234',
    ],
    date: '2026-10-02',
    reference: receipt
      ? ['Invoice', 'FAC-2026-4919302341']
      : [kind === 'estimate' ? 'Valid until' : 'Due date', '2026-11-01'],
    sections: [],
  }
  if (receipt) {
    model.receipt = {
      amount: `1500.00 ${currency}`,
      status: 'Cheque received - awaiting collection',
      fields: [
        ['Method', 'Cheque'],
        ['Cheque bank', 'Attijariwafa Bank'],
        ['Cheque number', 'CHQ-10292026'],
        ['Collection date', 'Awaiting collection'],
      ],
      balances: [
        ['Invoice total', `4500.00 ${currency}`],
        ['Collected to date', `1000.00 ${currency}`],
        ['Remaining', `3500.00 ${currency}`],
      ],
      note: 'Recorded at: 2026-10-02T10:00:00.000Z. Historical snapshot, not the current invoice balance. Pending payments are excluded.',
    }
    model.sections = [{ title: '', text: 'This receipt does not confirm cleared funds.' }]
  } else {
    if (delivery) model.reference = undefined
    const products = sampleProducts[english ? 'en' : 'fr']
    const prices = ['45.00', '120.00', '18.00']
    const quantities = [10, 5, 20]
    model.lines = Array.from({ length: many ? 45 : 3 }, (_, index) => {
      const quantity = many ? 5 : quantities[index]!
      const price = many ? '20.00' : prices[index]!
      return {
        name:
          products[index % 3]! + (many ? ` · ${english ? 'Item' : 'Article'} ${index + 1}` : ''),
        quantity: String(quantity),
        ...(!delivery ? { price, vat: '20%', total: (quantity * Number(price)).toFixed(2) } : {}),
      }
    })
    if (!delivery) {
      model.sections!.push({
        title: 'Agreed payment method',
        text: english ? 'Bank transfer' : 'Virement bancaire',
      })
      const subtotal = many ? 4500 : 450 + 600 + 360
      model.totals = [
        ['Subtotal', `${subtotal.toFixed(2)} ${currency}`],
        ['VAT', `${(subtotal * 0.2).toFixed(2)} ${currency}`],
        ['Total', `${(subtotal * 1.2).toFixed(2)} ${currency}`],
      ]
      if (data.showPaymentTerms && data.paymentTerms)
        model.sections!.push({ title: 'Payment terms', text: data.paymentTerms })
      if (data.showBankDetails)
        model.sections!.push({
          title: 'Bank details',
          text: bankText(profile.bank, locale),
        })
    }
    model.receptionSignature = delivery
  }
  const { html, pageCount } = await renderDocument(model, data, images)
  return { html, pageCount }
}

function bankText(bank: TemplatePreviewProfile['bank'], locale: string) {
  if (!bank)
    return locale === 'en-GB'
      ? 'Your bank · RIB: 000000000000000000000000'
      : 'Votre banque · RIB : 000000000000000000000000'
  return [
    bank.bankName,
    bank.accountHolder,
    bank.rib ? `RIB : ${bank.rib}` : '',
    bank.iban ? `IBAN : ${bank.iban}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}
