import type { CreateDocumentTemplate } from '../../contracts/generated/settings/settings.schemas.js'

/** Internal presentation model, not an HTTP contract. Business modules map their snapshots here. */
export type DocumentAppearance = Pick<
  CreateDocumentTemplate,
  | 'layout'
  | 'density'
  | 'accentColor'
  | 'showSignature'
  | 'showBankDetails'
  | 'showPaymentTerms'
  | 'footerText'
>
export type DocumentModel = {
  locale?: string
  title: string
  number: string
  issuer: string[]
  client: string[]
  date: string
  reference?: [string, string]
  lines?: { name: string; quantity: string; price?: string; vat?: string; total?: string }[]
  totals?: [string, string][]
  sections?: { title: string; text: string }[]
  receptionSignature?: boolean
  receipt?: {
    amount: string
    status: string
    fields: [string, string][]
    balances: [string, string][]
    note: string
  }
}
export type DocumentImages = { logo?: Uint8Array; signature?: Uint8Array }

export const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
export const text = (value: unknown) => (typeof value === 'string' ? value : '')
export function party(value: unknown) {
  const data = record(value)
  return [
    text(data.legalName) || [text(data.firstName), text(data.lastName)].filter(Boolean).join(' '),
    [data.addressLine1, data.addressLine2, data.city, data.postalCode]
      .map(text)
      .filter(Boolean)
      .join(', '),
    data.ice ? `ICE: ${text(data.ice)}` : '',
    [data.email, data.phone].map(text).filter(Boolean).join(' · '),
  ].filter(Boolean)
}
