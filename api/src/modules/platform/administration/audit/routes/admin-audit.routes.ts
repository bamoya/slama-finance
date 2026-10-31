import type { FastifyInstance } from 'fastify'

import type { createAdminAuditController } from '../controllers/admin-audit.controller.js'

export function registerAdminAuditRoutes(
  app: FastifyInstance,
  controller: ReturnType<typeof createAdminAuditController>,
) {
  app.get('/audit', controller.list)
}
