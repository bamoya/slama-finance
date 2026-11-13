/**
 * Registration identifiers a legal type shows (reference table field names). A field the type does not
 * show is kept in the stored settings but never printed, so a company that changes type does not print
 * the identifiers of its former registration.
 */
export function shownIdentity<T extends Record<string, unknown>>(
  company: T,
  shownFields: Iterable<string>,
): T {
  const shown = new Set(shownFields)
  const keep = (field: string, keys: string[]) =>
    shown.has(field) ? {} : Object.fromEntries(keys.map((key) => [key, null]))
  return {
    ...company,
    ...keep('ice', ['ice']),
    ...keep('taxIdentifier', ['taxIdentifier']),
    ...keep('registrationNumber', ['registrationNumber', 'registrationCity']),
    ...keep('professionalTaxNumber', ['professionalTaxNumber']),
    ...keep('shareCapital', ['shareCapital']),
  }
}
