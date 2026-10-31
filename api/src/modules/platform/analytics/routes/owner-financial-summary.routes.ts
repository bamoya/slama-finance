import type { FastifyInstance } from 'fastify'

import type { createOwnerFinancialSummaryController } from '../controllers/owner-financial-summary.controller.js'
export function registerOwnerFinancialSummaryRoutes(
  app: FastifyInstance,
  controller: ReturnType<typeof createOwnerFinancialSummaryController>,
) {
  app.get('/api/v1/owner/analytics/financial-summary', controller.get)
}
