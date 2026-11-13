import { shownIdentity } from '../../../../../lib/documents/shown-identity.js'
import { AppError } from '../../../../../lib/errors.js'
import type { LegalField } from '../repositories/legal-requirements.js'

type Company = {
  legalName: string | null
  tradeName: string | null
  legalForm: string | null
  legalType: string
  vatRegime: string
  vatExemptionMention: string | null
  shareCapital: string | null
  currency: string
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  postalCode: string | null
  countryCode: string
  ice: string | null
  taxIdentifier: string | null
  registrationNumber: string | null
  registrationCity: string | null
  professionalTaxNumber: string | null
  email: string | null
  phone: string | null
}

/**
 * Default VAT exemption wording. PENDING ACCOUNTANT CONFIRMATION: the exact legal wording per type is not
 * settled and no article number is quoted. A custom mention on the company settings replaces it.
 */
const defaultExemption = (_legalType: string, locale: string) =>
  locale.startsWith('en') ? 'VAT not applicable' : 'TVA non applicable'

export const isExempt = (company: Pick<Company, 'vatRegime'>) => company.vatRegime === 'exempt'

/** The identity printed on documents, frozen on the document (issue time for invoices). */
export function issuerSnapshot(
  fullCompany: Company,
  locale: string,
  fields: LegalField[],
  kind?: 'simple' | 'legal',
) {
  const company = shownIdentity(
    fullCompany,
    fields.map((f) => f.field),
  )
  return {
    locale,
    legalName: company.legalName,
    tradeName: company.tradeName,
    legalForm: company.legalForm,
    legalType: company.legalType,
    vatRegime: company.vatRegime,
    vatExemptionMention: isExempt(company)
      ? (company.vatExemptionMention ?? defaultExemption(company.legalType, locale))
      : null,
    ...(kind ? { documentKind: kind } : {}),
    shareCapital: company.shareCapital,
    currency: company.currency,
    addressLine1: company.addressLine1,
    addressLine2: company.addressLine2,
    city: company.city,
    postalCode: company.postalCode,
    countryCode: company.countryCode,
    ice: company.ice,
    taxIdentifier: company.taxIdentifier,
    registrationNumber: company.registrationNumber,
    registrationCity: company.registrationCity,
    professionalTaxNumber: company.professionalTaxNumber,
    email: company.email,
    phone: company.phone,
  }
}

/** A delivery note copies the invoice identity but is not an invoice: drop the invoice document kind. */
export function withoutDocumentKind(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== 'object') return null
  const { documentKind: _kind, ...rest } = snapshot as Record<string, unknown>
  return rest
}

const present = (company: Company, field: string) => {
  const value = (company as Record<string, unknown>)[field]
  if (field === 'registrationNumber')
    return !!String(company.registrationNumber ?? '').trim() && !!company.registrationCity?.trim()
  return typeof value === 'string' && value.trim().length > 0
}

/** Required fields (for a legal invoice) the company has not filled in yet. */
export function missingLegalFields(company: Company, fields: LegalField[]) {
  return fields
    .filter((f) => f.requiredForLegalInvoice && !present(company, f.field))
    .map((f) => f.field)
}

/**
 * Issue-time decision for an invoice: an individual issues a simple invoice; a registered type issues
 * a legal invoice once every required field is complete, otherwise the issue is refused.
 */
export function invoiceKind(company: Company, fields: LegalField[]): 'simple' | 'legal' {
  if (company.legalType === 'individual') return 'simple'
  const missing = missingLegalFields(company, fields)
  if (missing.length)
    throw new AppError(
      409,
      'MISSING_LEGAL_IDENTITY',
      'Complete the company legal identity in company settings before issuing a legal invoice.',
      Object.fromEntries(
        missing.map((field) => [
          field,
          ['Required to issue a legal invoice for this company type.'],
        ]),
      ),
    )
  return 'legal'
}

/** Exempt companies never charge VAT: refuse any positive line rate. */
export function assertNoVatWhenExempt(
  company: Pick<Company, 'vatRegime'>,
  lines: { vatRate: string | number | null }[],
) {
  if (isExempt(company) && lines.some((line) => line.vatRate !== null && Number(line.vatRate) > 0))
    throw new AppError(
      400,
      'VAT_EXEMPT_REGIME',
      'This company is VAT exempt: remove the VAT rate from the lines or change the VAT regime in company settings.',
    )
}
