import type { FastifyInstance, FastifyRequest } from 'fastify'

import { AppError } from '../lib/errors.js'
import type { PlatformSites, Site, SiteKind } from '../lib/platform-sites.js'
import { inTenantScope } from '../lib/tenant-database.js'

declare module 'fastify' {
  interface FastifyRequest {
    organizationId?: string
    site: Site
  }
}

const notFound = () => new AppError(404, 'NOT_FOUND', 'The requested resource was not found.')

/** Route group served by a path; null means any classified site may call it. */
export function routeGroup(path: string): SiteKind | 'any' | 'known' | null {
  if (path === '/health' || path === '/ready' || path === '/api/v1/health') return 'any'
  if (!path.startsWith('/api/v1/')) return null
  if (path.startsWith('/api/v1/public/')) return 'known'
  if (path.startsWith('/api/v1/owner/') || path.startsWith('/api/v1/owner-auth/')) return 'owner'
  if (path.startsWith('/api/v1/admin/')) return 'admin'
  return 'organization'
}

/**
 * Classify the trusted host (X-Forwarded-Host is honoured only from TRUST_PROXY_IPS through
 * Fastify trustProxy), reject route groups served on another kind of site with 404, enforce
 * same-origin browser mutations, and select the organization scope from the host slug.
 * Selecting a scope never grants access; credentials and permissions are checked later.
 */
export function registerTenantScope(
  app: FastifyInstance,
  sites: PlatformSites,
  organizationBySlug: (slug: string) => Promise<{ id: string } | undefined>,
) {
  app.decorateRequest('site', null as never)
  const select = async (request: FastifyRequest) => {
    const site = sites.classify(request.host)
    request.site = site
    const path = request.url.split('?')[0]!
    const group = routeGroup(path)
    if (group === null || group === 'any') return undefined
    if (site.kind === 'unknown' || (group !== 'known' && group !== site.kind)) throw notFound()
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      // All browser mutations, including login/logout, must come from this exact site.
      if (request.headers.origin !== sites.originOf(request.host))
        throw new AppError(403, 'UNTRUSTED_ORIGIN', 'This request origin is not allowed.')
    }
    if (group !== 'organization' || site.kind !== 'organization') return undefined
    const organization = await organizationBySlug(site.slug)
    if (!organization) throw notFound()
    request.organizationId = organization.id
    return organization.id
  }
  // The AsyncLocalStorage scope must wrap the remaining lifecycle, so done() runs inside it.
  app.addHook('onRequest', (request, _reply, done) => {
    select(request).then(
      (organizationId) => (organizationId ? inTenantScope(organizationId, done) : done()),
      (error: Error) => done(error),
    )
  })
}
