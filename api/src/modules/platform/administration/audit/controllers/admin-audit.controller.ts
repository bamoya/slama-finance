import type { FastifyRequest } from 'fastify'

import { listAdminAuditQuerySchema } from '../../../../../contracts/generated/administration/administration.schemas.js'
import type { AdminAuditService } from '../services/admin-audit.service.js'

export function createAdminAuditController(audit: AdminAuditService) {
  return {
    async list(request: FastifyRequest) {
      return audit.list(listAdminAuditQuerySchema.parse(request.query).page)
    },
  }
}
