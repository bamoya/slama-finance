export function weightLabel(weightG: number) {
  return weightG >= 1000 && weightG % 1000 === 0 ? `${weightG / 1000} kg` : `${weightG} g`
}
export function formatPrice(amount: string | number) {
  return new Intl.NumberFormat('fr-MA', { style: 'currency', currency: 'MAD' }).format(
    Number(amount),
  )
}
