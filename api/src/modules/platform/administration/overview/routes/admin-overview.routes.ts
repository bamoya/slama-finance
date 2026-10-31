import type { FastifyInstance } from 'fastify'

import type { createAdminOverviewController } from '../controllers/admin-overview.controller.js'

export function registerAdminOverviewRoutes(
  app: FastifyInstance,
  controller: ReturnType<typeof createAdminOverviewController>,
) {
  app.get('/overview', controller.get)
}
