/** Immutable for this document. Workspace changes reload the document, never mutate a global tenant. */
const pathname = typeof window === 'undefined' ? '' : window.location.pathname
const staff = /^\/organizations\/([a-f0-9-]{36})\/workspace(?:\/|$)/i.exec(pathname)
export const documentWorkspace = staff
  ? { organizationId: staff[1]!.toLowerCase(), identityType: 'staff' as const }
  : null
export const workspaceUrl = (id: string, _identity: 'staff' = 'staff') =>
  `/organizations/${id}/workspace/dashboard`
export const openWorkspace = (id: string, identity: 'staff' = 'staff') =>
  window.location.assign(workspaceUrl(id, identity))
