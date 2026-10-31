import type { FastifyRequest } from 'fastify'

import { getPublicOrganizationAddressParamsSchema } from '../../../../contracts/generated/identity/public-sites.schemas.js'
import type { createPublicSiteService } from '../services/public-site.service.js'

export function createPublicSiteController(service: ReturnType<typeof createPublicSiteService>) {
  return {
    current: (request: FastifyRequest) => service.current(request.site),
    address: (request: FastifyRequest) =>
      service.address(
        getPublicOrganizationAddressParamsSchema.parse(request.params).organizationId,
      ),
  }
}
