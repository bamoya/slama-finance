import type { FastifyInstance } from 'fastify'

import { AppError } from '../lib/errors.js'
import { inTenantScope } from '../lib/tenant-database.js'

declare module 'fastify' {
  interface FastifyRequest {
    organizationId?: string
  }
}

/** Select scope before credentials are checked; selecting a tenant never grants access. */
export function registerTenantScope(app: FastifyInstance) {
  app.addHook('onRequest', (request, _reply, done) => {
    if (
      !request.url.startsWith('/v1/') ||
      request.url.startsWith('/v1/owner/') ||
      request.url.startsWith('/v1/owner-auth/') ||
      request.method === 'OPTIONS'
    )
      return done()
    const routeScope = /^\/v1\/organizations\/([a-f0-9-]+)\//i.exec(request.url)?.[1]
    const headerScope = request.headers['x-organization-id']
    const organizationId = routeScope ?? headerScope
    if (
      typeof organizationId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId) ||
      (routeScope && headerScope && routeScope !== headerScope)
    )
      return done(new AppError(400, 'ORGANIZATION_REQUIRED', 'Select an organization.'))
    request.organizationId = organizationId
    inTenantScope(organizationId, done)
  })
}
