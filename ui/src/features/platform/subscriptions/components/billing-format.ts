import { translate } from '../../../../lib/i18n'

/** Amounts are integer centimes; display as "1 234,50 DH". */
export function formatDh(centimes: number) {
  const value = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(centimes / 100)
    .replace(/[\u202f\u00a0]/g, ' ')
  return `${value} DH`
}

/** Immutable published plan version, as numbered by the API. */
export const versionLabel = (number: number) => translate('Version {{number}}', { number })

export function paymentKindLabel(kind: string) {
  return translate(
    kind === 'upgrade' ? 'Upgrade (prorated)' : kind === 'renewal' ? 'Renewal' : 'Activation',
  )
}

/** Payment methods are configurable codes (bank_transfer, cash, ...); known codes get a readable name. */
export function paymentMethodLabel(code: string) {
  switch (code) {
    case 'bank_transfer':
      return translate('Bank transfer')
    case 'cash':
      return translate('Cash')
    case 'cheque':
      return translate('Cheque')
    case 'admin_adjustment':
      return translate('Admin adjustment')
    default:
      return code
  }
}

/** Free administrator adjustments carry a technical marker instead of a payer reference. */
export const isAdjustmentMarker = (value: string) => value === 'admin_adjustment'

export function cycleLabel(cycle: string) {
  return translate(cycle === 'annual' ? 'Annual' : 'Monthly')
}

export function planLabel(code: string) {
  return code === 'trial' ? translate('Free trial') : code.charAt(0).toUpperCase() + code.slice(1)
}

/** Parses a typed DH amount ("1 234,50" or "1234.5") into integer centimes; null when invalid. */
export function parseDh(text: string) {
  const normalized = text.replace(/[\s\u202f\u00a0]/g, '').replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null
  const centimes = Math.round(Number(normalized) * 100)
  return Number.isSafeInteger(centimes) ? centimes : null
}

/** Issued document balance: open (due), settled, or refund due after a credit note. */
export function invoiceStatus(status: 'open' | 'settled' | 'refund_due') {
  return status === 'settled'
    ? { label: translate('Settled'), tone: 'active' as const }
    : status === 'open'
      ? { label: translate('Balance due'), tone: 'draft' as const }
      : { label: translate('Refund due'), tone: 'overdue' as const }
}

export const documentKindLabel = (kind: 'invoice' | 'credit_note') =>
  translate(kind === 'invoice' ? 'Invoice' : 'Credit note')

export function paymentStatusTone(status: string) {
  return status === 'confirmed' ? 'active' : status === 'submitted' ? 'draft' : 'overdue'
}
