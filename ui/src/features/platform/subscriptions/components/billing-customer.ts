import type { BillingCustomer } from '../../../../api/generated/models'
import { ApiError } from '../../../../lib/api-error'
import { translate } from '../../../../lib/i18n'

/** Editable text form of the identity the platform invoices (strings only, no nulls). */
export type CustomerForm = {
  type: 'individual' | 'company'
  legalName: string
  ice: string
  address: string
  registrationNumber: string
  taxIdentifier: string
}
export type CustomerField = Exclude<keyof CustomerForm, 'type'>
export type CustomerErrors = Partial<Record<CustomerField, string>>

export const customerFields: CustomerField[] = [
  'legalName',
  'ice',
  'address',
  'registrationNumber',
  'taxIdentifier',
]

export function customerToForm(customer?: BillingCustomer | null): CustomerForm {
  return {
    type: customer?.type === 'company' ? 'company' : 'individual',
    legalName: customer?.legalName ?? '',
    ice: customer?.ice ?? '',
    address: customer?.address ?? '',
    registrationNumber: customer?.registrationNumber ?? '',
    taxIdentifier: customer?.taxIdentifier ?? '',
  }
}

/** Format-only checks (ICE is never looked up in a registry); the API stays authoritative. */
export function validateCustomer(
  form: CustomerForm,
):
  | { errors: CustomerErrors; customer?: undefined }
  | { customer: BillingCustomer; errors?: undefined } {
  if (form.type === 'individual')
    return {
      customer: {
        type: 'individual',
        legalName: null,
        ice: null,
        address: null,
        registrationNumber: null,
        taxIdentifier: null,
      },
    }
  const errors: CustomerErrors = {}
  const legalName = form.legalName.trim(),
    // The printed format groups digits with spaces (001 122 334 455 667).
    ice = form.ice.replace(/\s+/g, ''),
    address = form.address.trim()
  if (!legalName) errors.legalName = 'Enter the legal name.'
  if (!ice) errors.ice = 'Enter the ICE.'
  else if (!/^\d{15}$/.test(ice)) errors.ice = 'The ICE has 15 digits.'
  if (!address) errors.address = 'Enter the address.'
  if (Object.keys(errors).length) return { errors }
  return {
    customer: {
      type: 'company',
      legalName,
      ice,
      address,
      registrationNumber: form.registrationNumber.trim() || null,
      taxIdentifier: form.taxIdentifier.trim() || null,
    },
  }
}

/** Field messages returned by the API (400 VALIDATION_ERROR), keyed by customer field. */
export function customerApiErrors(error: unknown): Record<string, string[]> {
  if (!(error instanceof ApiError) || !error.fieldErrors) return {}
  const result: Record<string, string[]> = {}
  for (const [path, messages] of Object.entries(error.fieldErrors)) {
    const field = path.split('.').at(-1) ?? path
    if ((customerFields as string[]).includes(field)) result[field] = messages
  }
  return result
}

export function customerTypeLabel(type: 'individual' | 'company') {
  return translate(type === 'company' ? 'Company' : 'Individual')
}
