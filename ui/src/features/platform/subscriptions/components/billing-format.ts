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

export function cycleLabel(cycle: string) {
  return translate(cycle === 'annual' ? 'Annual' : 'Monthly')
}

export function planLabel(code: string) {
  return code === 'trial' ? translate('Free trial') : code.charAt(0).toUpperCase() + code.slice(1)
}

export function paymentStatusTone(status: string) {
  return status === 'confirmed' ? 'active' : status === 'submitted' ? 'draft' : 'overdue'
}
