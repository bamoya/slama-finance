import type { FastifyInstance } from 'fastify'

import { createRequirePortalOrigin } from '../../../../middlewares/require-portal-origin.js'
import type { createOwnerFinancialSummaryController } from '../controllers/owner-financial-summary.controller.js'
export function registerOwnerFinancialSummaryRoutes(
  app: FastifyInstance,
  controller: ReturnType<typeof createOwnerFinancialSummaryController>,
  origin?: string,
) {
  app.get(
    '/api/v1/owner/analytics/financial-summary',
    { preHandler: createRequirePortalOrigin(origin) },
    controller.get,
  )
}
