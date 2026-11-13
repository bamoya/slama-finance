import type { LegalType } from '../api/generated/models'
import { translate } from './i18n'

export const legalTypes: LegalType[] = [
  'individual',
  'auto_entrepreneur',
  'sole_trader',
  'sarl',
  'sarl_au',
  'sa',
  'other_company',
  'association',
  'cooperative',
]
const labels: Record<LegalType, string> = {
  individual: 'Individual (not registered)',
  auto_entrepreneur: 'Auto-entrepreneur',
  sole_trader: 'Sole trader',
  sarl: 'SARL',
  sarl_au: 'SARL AU',
  sa: 'SA',
  other_company: 'Other company',
  association: 'Association',
  cooperative: 'Cooperative',
}
export const legalTypeOptions = () =>
  legalTypes.map((value) => ({ value, label: translate(labels[value]) }))

type Requirements =
  | {
      items: { legalType: string; fields: { field: string; requiredForLegalInvoice: boolean }[] }[]
    }
  | undefined
/** Fields always shown whatever the type (basic contact and address); none is required for individuals. */
const baseFields = [
  'legalName',
  'tradeName',
  'legalForm',
  'email',
  'phone',
  'addressLine1',
  'addressLine2',
  'city',
  'postalCode',
  'countryCode',
]
/** Form field -> reference key (the RC and its city are one requirement). */
const referenceKey = (field: string) =>
  field === 'registrationCity' ? 'registrationNumber' : field

export type LegalRules = {
  /** True when the type shows this form field. */
  shows: (field: string) => boolean
  /** True when the field is required to issue a legal invoice for this type. */
  required: (field: string) => boolean
  /** The type asks for at least one identifier (anything but an individual). */
  registered: boolean
}

export function legalRules(
  requirements: Requirements,
  legalType: string | null | undefined,
): LegalRules {
  const fields = new Map(
    (requirements?.items.find((item) => item.legalType === legalType)?.fields ?? []).map((f) => [
      f.field,
      f.requiredForLegalInvoice,
    ]),
  )
  const identifierFields = [
    'ice',
    'taxIdentifier',
    'registrationNumber',
    'registrationCity',
    'professionalTaxNumber',
    'shareCapital',
  ]
  return {
    registered: !!legalType && legalType !== 'individual',
    shows: (field) =>
      baseFields.includes(field) ||
      fields.has(referenceKey(field)) ||
      !identifierFields.includes(field),
    required: (field) => fields.get(referenceKey(field)) === true,
  }
}
