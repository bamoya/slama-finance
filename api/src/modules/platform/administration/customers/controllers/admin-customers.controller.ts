import type { FastifyRequest } from 'fastify'

import {
  getAdminOwnerParamsSchema,
  listAdminOwnersQuerySchema,
} from '../../../../../contracts/generated/administration/administration.schemas.js'
import type { createAdminCustomersService } from '../services/admin-customers.service.js'

export function createAdminCustomersController(
  customers: ReturnType<typeof createAdminCustomersService>,
) {
  return {
    async list(request: FastifyRequest) {
      return customers.list(listAdminOwnersQuerySchema.parse(request.query))
    },
    async detail(request: FastifyRequest) {
      return customers.detail(getAdminOwnerParamsSchema.parse(request.params).ownerId)
    },
  }
}
