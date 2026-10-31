import type { FastifyRequest } from 'fastify'

import { getOwnerFinancialSummaryQuerySchema } from '../../../../contracts/generated/identity/owner-analytics.schemas.js'
import type { createOwnerFinancialSummaryService } from '../services/owner-financial-summary.service.js'
export function createOwnerFinancialSummaryController(
  service: ReturnType<typeof createOwnerFinancialSummaryService>,
) {
  return {
    get: (request: FastifyRequest) =>
      service.get(
        request.cookies.slama_owner_session,
        getOwnerFinancialSummaryQuerySchema.parse(request.query),
      ),
  }
}
