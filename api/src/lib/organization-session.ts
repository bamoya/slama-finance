/** Organization HTTP adapters never read platform cookies or fall back across identity realms. */
export function organizationSessionToken(request: {
  headers: Record<string, unknown>
  cookies: Record<string, string | undefined>
}) {
  const realm = request.headers['x-workspace-identity']
  if (realm !== undefined && realm !== 'staff') return undefined
  return request.cookies.slama_staff_session ?? request.cookies.slama_session
}
