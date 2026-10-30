import i18n from '../../../lib/i18n'
import { numberFormatter } from '../../../lib/number-format'
export const formatCount = (value: number) => numberFormatter(i18n.language).format(value)

export const formatWeight = (grams: number) =>
  grams >= 1000
    ? `${numberFormatter(i18n.language, { maximumFractionDigits: 3 }).format(grams / 1000)} kg`
    : `${formatCount(grams)} g`

export const formatRevenue = (amount: string, currency: string) => {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(amount)
  if (!match) return amount
  const formatter = numberFormatter('fr-MA', { style: 'currency', currency })
  const integer = numberFormatter('fr-MA').format(BigInt(match[2] ?? '0'))
  const fraction = (match[3] ?? '').padEnd(2, '0')
  return formatter
    .formatToParts(match[1] ? -0.01 : 0.01)
    .map((part) => {
      if (part.type === 'integer') return integer
      if (part.type === 'fraction') return fraction
      if (part.type === 'group') return ''
      return part.value
    })
    .join('')
}
