import { type PlatformSite, adminOrigin, ownerOrigin } from '../../lib/platform-sites'

export type LegacyRedirect =
  { kind: 'origin'; url: string } | { kind: 'lookup'; organizationId: string; rest: string }

const legacyOrganization =
  /^\/organizations\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\/.*)?$/i
const legacyOwnerAuth = new Set(['/auth/login', '/auth/register'])

/**
 * Old path-based addresses. Returns where the visitor belongs, or null for a current address.
 * The query string and fragment are appended by the caller.
 */
export function resolveLegacyRedirect(site: PlatformSite, pathname: string): LegacyRedirect | null {
  const path = pathname.replace(/\/+$/, '') || '/'
  const organization = legacyOrganization.exec(path)
  if (organization) {
    const rest = organization[2] ?? ''
    // The owner site legitimately owns /organizations/<id> and /organizations/<id>/setup.
    const ownerPage = site.kind === 'owner' && (rest === '' || rest === '/setup')
    if (!ownerPage) return { kind: 'lookup', organizationId: organization[1]!.toLowerCase(), rest }
  }
  if (site.kind !== 'admin' && (path === '/admin' || path.startsWith('/admin/')))
    return { kind: 'origin', url: `${adminOrigin()}${path.slice('/admin'.length) || '/'}` }
  if (site.kind !== 'owner' && (path === '/owner' || path.startsWith('/owner/'))) {
    return { kind: 'origin', url: `${ownerOrigin()}${path.slice('/owner'.length) || '/'}` }
  }
  if (site.kind === 'public' && legacyOwnerAuth.has(path))
    return { kind: 'origin', url: `${ownerOrigin()}${path.slice('/auth'.length)}` }
  return null
}

/** Joins an origin returned by the API with the preserved path, query and fragment. */
export function joinOrigin(origin: string, path: string, suffix = '') {
  return `${origin.replace(/\/+$/, '')}${path || '/'}${suffix}`
}
