import type { FastifyInstance } from 'fastify'

import type { createAdminCustomersController } from '../controllers/admin-customers.controller.js'

/** URLs keep the contract's "owners" naming. */
export function registerAdminCustomersRoutes(
  app: FastifyInstance,
  controller: ReturnType<typeof createAdminCustomersController>,
) {
  app.get('/owners', controller.list)
  app.get('/owners/:ownerId', controller.detail)
}
