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

export function paymentStatusTone(status: string) {
  return status === 'confirmed' ? 'active' : status === 'submitted' ? 'draft' : 'overdue'
}
