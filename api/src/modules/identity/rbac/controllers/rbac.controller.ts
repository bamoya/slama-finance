import type { FastifyReply, FastifyRequest } from 'fastify'

import {
  CreateRoleSchema as roleSchema,
  deleteRoleParamsSchema,
  PermissionAssignmentSchema as permissionAssignment,
  replaceRolePermissionsParamsSchema as roleParams,
} from '../../../../contracts/generated/identity/rbac.schemas.js'
import { toPermission, toRole } from '../mappers/rbac.mapper.js'
import type { createRbacService } from '../services/rbac.service.js'

export function createRbacController(service: ReturnType<typeof createRbacService>) {
  return {
    async deleteRole(request: FastifyRequest, reply: FastifyReply) {
      await service.deleteRole(
        deleteRoleParamsSchema.parse(request.params).roleId,
        request.actor!.userId,
      )
      return reply.code(204).send()
    },
    listPermissions: async () => (await service.listPermissions()).map(toPermission),
    listRoles: async () => (await service.listRoles()).map(toRole),
    async createRole(request: FastifyRequest, reply: FastifyReply) {
      return reply
        .code(201)
        .send(
          toRole(await service.createRole(roleSchema.parse(request.body), request.actor!.userId)),
        )
    },
    async replacePermissions(request: FastifyRequest, reply: FastifyReply) {
      await service.replacePermissions(
        roleParams.parse(request.params).roleId,
        permissionAssignment.parse(request.body).permissionKeys,
        request.actor!.userId,
      )
      return reply.code(204).send()
    },
  }
}
