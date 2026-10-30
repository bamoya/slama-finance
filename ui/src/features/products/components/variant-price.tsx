import { displayNumber, numberFormatter } from '../../../lib/number-format'
export function weightLabel(weightG: number) {
  return weightG >= 1000 && weightG % 1000 === 0
    ? `${displayNumber(weightG / 1000)} kg`
    : `${displayNumber(weightG)} g`
}
export function formatPrice(amount: string | number) {
  return numberFormatter('fr-MA', { style: 'currency', currency: 'MAD' }).format(Number(amount))
}
