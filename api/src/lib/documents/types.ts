import type { CreateDocumentTemplate } from '../../contracts/generated/settings/settings.schemas.js'
import { displayNumber } from '../number-format.js'

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
/** Printed legal form of the registered types (French, English); individual and other_company print nothing. */
const legalTypeLabels: Record<string, [string, string]> = {
  auto_entrepreneur: ['Auto-entrepreneur', 'Auto-entrepreneur'],
  sole_trader: ['Personne physique', 'Sole trader'],
  sarl: ['SARL', 'SARL'],
  sarl_au: ['SARL AU', 'SARL AU'],
  sa: ['SA', 'SA'],
  association: ['Association', 'Association'],
  cooperative: ['Coopérative', 'Cooperative'],
}
/** Issuer identity: the party lines plus RC (with registration city) and IF when the profile has them. */
export function issuerParty(value: unknown) {
  const data = record(value)
  const lines = party(value)
  const english = text(data.locale).startsWith('en')
  const form =
    text(data.legalForm).trim() || legalTypeLabels[text(data.legalType)]?.[english ? 1 : 0]
  const capitalAmount = Number(text(data.shareCapital).replace(/\s/g, ''))
  const capital =
    Number.isFinite(capitalAmount) && capitalAmount > 0
      ? `${english ? 'Share capital' : 'Capital'}: ${displayNumber(text(data.shareCapital).replace(/\s/g, ''), text(data.locale) || 'fr-MA')} ${text(data.currency) || 'MAD'}`
      : ''
  const identity = [form, capital].filter(Boolean).join(' · ')
  if (identity) lines.splice(Math.min(1, lines.length), 0, identity)
  const fiscal = [
    data.registrationNumber
      ? `RC: ${text(data.registrationNumber)}${data.registrationCity ? ` (${text(data.registrationCity)})` : ''}`
      : '',
    data.taxIdentifier ? `IF: ${text(data.taxIdentifier)}` : '',
    data.professionalTaxNumber ? `TP: ${text(data.professionalTaxNumber)}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
  if (fiscal) {
    const ice = lines.findIndex((line) => line.startsWith('ICE:'))
    lines.splice(ice >= 0 ? ice + 1 : lines.length, 0, fiscal)
  }
  return lines
}
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
