/** Internal tenant scope is selected by the authenticated request, not exposed as a writable DTO field. */
export const publicData = (value: unknown): unknown =>
  JSON.parse(
    JSON.stringify(value, (key, entry: unknown) => (key === 'organizationId' ? undefined : entry)),
  )
