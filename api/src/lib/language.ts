/** Company locale is the sole default; overrides are resolved at capture/send time. */
export function resolveLanguage(override?: unknown, companyLocale?: unknown): 'fr' | 'en' {
  const value = override && override !== 'company' ? override : companyLocale
  return typeof value === 'string' && value.startsWith('en') ? 'en' : 'fr'
}

export function resolveLocale(override?: unknown, companyLocale?: unknown): 'fr-MA' | 'en-GB' {
  return resolveLanguage(override, companyLocale) === 'en' ? 'en-GB' : 'fr-MA'
}
