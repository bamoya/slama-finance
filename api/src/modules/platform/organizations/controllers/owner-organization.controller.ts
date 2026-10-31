import type { FastifyRequest } from 'fastify'

import {
  getOwnerOrganizationParamsSchema,
  listOwnerOrganizationsQuerySchema,
} from '../../../../contracts/generated/identity/owner-organizations.schemas.js'
import type { createOwnerOrganizationService } from '../services/owner-organization.service.js'

export function createOwnerOrganizationController(
  service: ReturnType<typeof createOwnerOrganizationService>,
) {
  return {
    list: (request: FastifyRequest) =>
      service.list(
        request.cookies.slama_owner_session,
        listOwnerOrganizationsQuerySchema.parse(request.query),
      ),
    get: (request: FastifyRequest) =>
      service.get(
        request.cookies.slama_owner_session,
        getOwnerOrganizationParamsSchema.parse(request.params).organizationId,
      ),
  }
}
