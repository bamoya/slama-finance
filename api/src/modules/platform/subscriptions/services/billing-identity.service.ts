import type {
  BillingCustomer,
  BillingIssuer,
} from '../../../../contracts/generated/subscriptions/subscriptions.schemas.js'
import { AppError, type FieldErrors } from '../../../../lib/errors.js'

export const individualCustomer: BillingCustomer = {
  type: 'individual',
  legalName: null,
  ice: null,
  address: null,
  registrationNumber: null,
  taxIdentifier: null,
}

const ICE = /^[0-9]{15}$/
const clean = (value: string | null | undefined) => value?.trim() || null

/**
 * Checkout identity: individual carries nothing (details are dropped); company needs legal name,
 * a 15-digit ICE (format only, never a registry check) and an address, RC and IF optional.
 */
export function billingCustomer(input: BillingCustomer): BillingCustomer {
  if (input.type === 'individual') return individualCustomer
  const customer: BillingCustomer = {
    type: 'company',
    legalName: clean(input.legalName),
    ice: clean(input.ice)?.replace(/\s+/g, '') ?? null,
    address: clean(input.address),
    registrationNumber: clean(input.registrationNumber),
    taxIdentifier: clean(input.taxIdentifier),
  }
  const fields: FieldErrors = {}
  if (!customer.legalName) fields.legalName = ['Enter the company legal name.']
  if (!customer.ice || !ICE.test(customer.ice)) fields.ice = ['The ICE has 15 digits.']
  if (!customer.address) fields.address = ['Enter the company address.']
  if (Object.keys(fields).length)
    throw new AppError(400, 'VALIDATION_ERROR', 'Check the company details.', fields)
  return customer
}

/** Contract view of a snapshot: the e-mail kept for printing is not part of `BillingCustomer`. */
export const publicCustomer = (
  snapshot: BillingCustomer & { email?: string },
): BillingCustomer => ({
  type: snapshot.type,
  legalName: snapshot.legalName,
  ice: snapshot.ice,
  address: snapshot.address,
  registrationNumber: snapshot.registrationNumber,
  taxIdentifier: snapshot.taxIdentifier,
})

/** Issuer identity from the billing settings row (empty strings are not printed). */
export const billingIssuer = (s: {
  issuerLegalName: string
  issuerAddress: string
  issuerIce: string
  issuerRegistrationNumber: string
  issuerTaxIdentifier: string
  issuerTaxMention: string
  issuerPaymentTerms: string
}): BillingIssuer => ({
  legalName: s.issuerLegalName,
  address: s.issuerAddress,
  ice: s.issuerIce,
  registrationNumber: s.issuerRegistrationNumber,
  taxIdentifier: s.issuerTaxIdentifier,
  taxMention: s.issuerTaxMention,
  paymentTerms: s.issuerPaymentTerms,
})

const identityFields = [
  'legalName',
  'address',
  'ice',
  'registrationNumber',
  'taxIdentifier',
] as const
/** Identity fields still empty, shown to administrators as a warning. */
export const issuerMissing = (issuer: BillingIssuer) =>
  identityFields.filter((field) => !issuer[field].trim())

/** Trimmed administrator input; ICE empty or 15 digits. */
export function issuerInput(input: BillingIssuer): BillingIssuer {
  const issuer = Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, value.trim()]),
  ) as BillingIssuer
  issuer.ice = issuer.ice.replace(/\s+/g, '')
  if (issuer.ice && !ICE.test(issuer.ice))
    throw new AppError(400, 'VALIDATION_ERROR', 'Check the issuer details.', {
      'issuer.ice': ['The ICE has 15 digits.'],
    })
  return issuer
}

/** Invoices are never issued without the issuer legal name (payments and submissions still work). */
export function requireIssuer(issuer: BillingIssuer) {
  if (!issuer.legalName.trim())
    throw new AppError(
      409,
      'ISSUER_PROFILE_INCOMPLETE',
      'Complete the issuer legal name in billing settings, then confirm again.',
    )
  return issuer
}
