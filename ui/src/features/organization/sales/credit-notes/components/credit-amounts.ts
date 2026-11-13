/** Exact integer-centime arithmetic mirroring the server rule for credit note previews. */
export const toCents = (value: string | null | undefined): number => {
  if (!value) return 0
  const [whole = '0', fraction = ''] = value.split('.')
  return Number(whole) * 100 + Number(`${fraction}00`.slice(0, 2))
}

export const fromCents = (cents: number): string => {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

const roundHalfUp = (numerator: number, denominator: number) =>
  Math.floor((numerator * 2 + denominator) / (denominator * 2))

/** Credited HT of a quantity line: round(quantity * unitPrice, 2). */
export const quantityNetCents = (quantity: number, unitPrice: string) =>
  quantity * toCents(unitPrice)

/** VAT of a credited HT amount: round(net * rate / 100, 2), rate in percent. */
export const taxCents = (netCents: number, vatRate: string | null) => {
  if (!vatRate) return 0
  return roundHalfUp(netCents * toCents(vatRate), 10000)
}

/** Decimal string with at most two decimals, strictly positive. */
export const isPositiveAmount = (value: string) =>
  /^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$/.test(value) && toCents(value) > 0
