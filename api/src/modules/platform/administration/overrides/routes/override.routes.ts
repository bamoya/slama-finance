import type { FastifyInstance } from 'fastify'

import type { createOverrideController } from '../controllers/override.controller.js'

export function registerOverrideRoutes(
  app: FastifyInstance,
  controller: ReturnType<typeof createOverrideController>,
) {
  app.get('/owners/:ownerId/entitlement-overrides', controller.list)
  app.post('/owners/:ownerId/entitlement-overrides', controller.create)
  app.post('/owners/:ownerId/entitlement-overrides/:overrideId/revoke', controller.revoke)
}
