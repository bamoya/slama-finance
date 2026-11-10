import type { FastifyReply, FastifyRequest } from 'fastify'

import {
  AdminEntitlementOverrideCreateSchema,
  AdminOverrideRevocationSchema,
  listAdminEntitlementOverridesParamsSchema,
  revokeAdminEntitlementOverrideParamsSchema,
} from '../../../../../contracts/generated/administration/administration.schemas.js'
import type { AuthenticatedAdmin } from '../../shared/types/authenticated-admin.js'
import type { createOverrideService } from '../services/override.service.js'

type CurrentAdmin = (request: FastifyRequest) => AuthenticatedAdmin
const ownerOf = (request: FastifyRequest) =>
  listAdminEntitlementOverridesParamsSchema.parse(request.params).ownerId

export function createOverrideController(
  overrides: ReturnType<typeof createOverrideService>,
  currentAdmin: CurrentAdmin,
) {
  return {
    list: (request: FastifyRequest) => overrides.list(ownerOf(request)),
    async create(request: FastifyRequest, reply: FastifyReply) {
      const admin = currentAdmin(request)
      const created = await overrides.create(
        admin,
        ownerOf(request),
        AdminEntitlementOverrideCreateSchema.parse(request.body),
      )
      return reply.code(201).send(created)
    },
    revoke(request: FastifyRequest) {
      const params = revokeAdminEntitlementOverrideParamsSchema.parse(request.params)
      const body = AdminOverrideRevocationSchema.parse(request.body)
      return overrides.revoke(currentAdmin(request), params.ownerId, params.overrideId, {
        reason: body.reason,
      })
    },
  }
}
