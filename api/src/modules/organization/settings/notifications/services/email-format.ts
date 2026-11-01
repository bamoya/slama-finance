const MONEY_KEYS = new Set(['total', 'amount', 'outstanding'])
const DATE_KEYS = new Set(['issueDate', 'deliveryDate', 'dueDate', 'validUntil'])
const NARROW_NO_BREAK_SPACE = ' '

/** Stored decimals ("126180.00") become locale text: fr "126 180,00", en "126,180.00". */
export function formatEmailMoney(value: string, locale: string) {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value)
  if (!match) return value
  const english = locale.startsWith('en')
  const grouped = match[2]!.replace(/\B(?=(\d{3})+(?!\d))/g, english ? ',' : NARROW_NO_BREAK_SPACE)
  return `${match[1]}${grouped}${match[3] ? (english ? '.' : ',') + match[3] : ''}`
}

/** ISO dates ("2026-12-01") become the application date format DD-MM-YYYY. */
export function formatEmailDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value)
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value
}

/** Already formatted values (samples, pre-formatted text) pass through unchanged. */
export function formatEmailValues(values: Record<string, string>, locale: string) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      MONEY_KEYS.has(key)
        ? formatEmailMoney(value, locale)
        : DATE_KEYS.has(key)
          ? formatEmailDate(value)
          : value,
    ]),
  )
}

/**
 * Templates stored before the organization-name variable existed carry the platform brand as literal
 * text. Business emails belong to the organization, so the platform header, sign-off and footer are
 * rewritten to the organization-name variable at render time.
 */
export function useOrganizationBranding(template: string) {
  return template
    .replace(
      /(<p style="[^"]*">)BaMoYa<\/p>\s*<p style="[^"]*">Finance<\/p>/g,
      '$1{{organizationName}}</p>',
    )
    .replace(/BaMoYa|B-Finance/g, '{{organizationName}}')
}
