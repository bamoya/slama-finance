/** Use a non-breaking space for every group of three digits, in every language. */
export const NUMBER_GROUP_SPACE = '\u00a0'

export function numberFormatter(
  locale: string | string[] = 'fr-MA',
  options: Intl.NumberFormatOptions = {},
) {
  const formatter = new Intl.NumberFormat(locale, { ...options, useGrouping: true })
  const formatToParts = (value: number | bigint) =>
    formatter
      .formatToParts(value)
      .map((part) => (part.type === 'group' ? { ...part, value: NUMBER_GROUP_SPACE } : part))
  return {
    formatToParts,
    format: (value: number | bigint) =>
      formatToParts(value)
        .map((part) => part.value)
        .join(''),
  }
}

/** Format stored decimal strings without converting money to floating point or losing zeros. */
export function displayNumber(value: string | number, locale = 'fr-MA'): string {
  const raw = String(value)
  const match = /^(-?)(\d+)(?:\.(\d+))?([ \u00a0]*(?:[A-Z]{3}|%|kg|g))?$/.exec(raw)
  if (!match) return raw
  const decimal =
    new Intl.NumberFormat(locale).formatToParts(1.1).find((part) => part.type === 'decimal')
      ?.value ?? ','
  return (
    match[1] +
    match[2]!.replace(/\B(?=(\d{3})+(?!\d))/g, NUMBER_GROUP_SPACE) +
    (match[3] ? decimal + match[3] : '') +
    (match[4] ?? '')
  )
}
