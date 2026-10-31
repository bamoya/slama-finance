import type { FastifyInstance } from 'fastify'

import type { createPublicSiteController } from '../controllers/public-site.controller.js'

/** Served on every known site (see the host guard): the UI resolves its own host and legacy links. */
export function registerPublicSiteRoutes(
  app: FastifyInstance,
  controller: ReturnType<typeof createPublicSiteController>,
) {
  const config = { rateLimit: { max: 30, timeWindow: '1 minute' } }
  app.get('/api/v1/public/site', controller.current)
  app.get('/api/v1/public/organizations/:organizationId/address', { config }, controller.address)
}
