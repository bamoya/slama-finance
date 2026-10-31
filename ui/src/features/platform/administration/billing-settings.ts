import {
  type AdminBillingSettingsUpdate,
  AdminBillingSettingsUpdateSchema,
} from '../../../api/generated/schemas/administration/administration.schemas'

export type BillingFormValues = {
  vatApplicable: boolean
  vatPercent: string
  paymentMethods: string
  paymentInstructions: string
}
export type BillingErrors = Partial<Record<keyof BillingFormValues, string>>

const methodPattern = /^[a-z0-9_]+$/

/** 20 % ↔ 2000 basis points; accepts "," or "." as decimal separator. */
export function percentToBasisPoints(text: string): number | null {
  const normalized = text.trim().replace(',', '.')
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(normalized)) return null
  const value = Math.round(Number(normalized) * 100)
  return value >= 0 && value <= 10000 ? value : null
}

export function basisPointsToPercent(basisPoints: number): string {
  return String(basisPoints / 100).replace('.', ',')
}

export function parseMethods(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((method) => method.trim())
    .filter(Boolean)
}

export function toFormValues(settings: {
  taxRateBasisPoints: number | null
  paymentMethods: string[]
  paymentInstructions: string
}): BillingFormValues {
  return {
    vatApplicable: settings.taxRateBasisPoints !== null,
    vatPercent:
      settings.taxRateBasisPoints === null ? '' : basisPointsToPercent(settings.taxRateBasisPoints),
    paymentMethods: settings.paymentMethods.join(', '),
    paymentInstructions: settings.paymentInstructions,
  }
}

/** Returns the API payload, or field errors in English source phrases. */
export function validateBilling(
  values: BillingFormValues,
):
  | { errors: BillingErrors; payload?: undefined }
  | { payload: AdminBillingSettingsUpdate; errors?: undefined } {
  const errors: BillingErrors = {}
  let taxRateBasisPoints: number | null = null
  if (values.vatApplicable) {
    taxRateBasisPoints = percentToBasisPoints(values.vatPercent)
    if (taxRateBasisPoints === null) errors.vatPercent = 'Enter a rate between 0 and 100.'
  }
  const methods = parseMethods(values.paymentMethods)
  if (methods.length < 1 || methods.length > 10)
    errors.paymentMethods = 'Enter between 1 and 10 payment methods.'
  else if (methods.some((method) => !methodPattern.test(method)))
    errors.paymentMethods = 'Use lowercase letters, digits and underscores only.'
  else if (new Set(methods).size !== methods.length)
    errors.paymentMethods = 'Payment methods must be unique.'
  if (values.paymentInstructions.length > 2000)
    errors.paymentInstructions = 'Instructions must not exceed 2000 characters.'
  if (Object.keys(errors).length) return { errors }
  const parsed = AdminBillingSettingsUpdateSchema.safeParse({
    taxRateBasisPoints,
    paymentMethods: methods,
    paymentInstructions: values.paymentInstructions,
  })
  if (!parsed.success) return { errors: { paymentMethods: 'Check the payment methods.' } }
  return { payload: parsed.data }
}
