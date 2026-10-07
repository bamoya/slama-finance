import type { FastifyReply, FastifyRequest } from 'fastify'

import {
  CreateStaffSchema as createStaffSchema,
  getStaffParamsSchema as staffParams,
  listStaffQuerySchema as staffQuery,
  RoleAssignmentSchema as staffRoles,
  type StaffDetail,
  type StaffOnboarding,
  type StaffPage,
  type TemporaryPassword,
  UpdateStaffSchema as staffUpdate,
} from '../../../../contracts/generated/identity/staff.schemas.js'
import { toStaff } from '../mappers/staff.mapper.js'
import type { createStaffService } from '../services/staff.service.js'

export function createStaffController(service: ReturnType<typeof createStaffService>) {
  return {
    async list(request: FastifyRequest): Promise<StaffPage> {
      const result = await service.list(staffQuery.parse(request.query))
      return { ...result, items: result.items.map(toStaff) }
    },
    async detail(request: FastifyRequest): Promise<StaffDetail> {
      const result = await service.detail(staffParams.parse(request.params).userId)
      return { ...toStaff(result.user), roles: result.roles, permissionKeys: result.permissionKeys }
    },
    async update(request: FastifyRequest) {
      return toStaff(
        await service.update(
          staffParams.parse(request.params).userId,
          staffUpdate.parse(request.body),
          request.actor!.userId,
        ),
      )
    },
    async replaceRoles(request: FastifyRequest, reply: FastifyReply) {
      await service.replaceRoles(
        staffParams.parse(request.params).userId,
        staffRoles.parse(request.body).roleIds,
        request.actor!.userId,
      )
      return reply.code(204).send()
    },
    status:
      (action: 'disable' | 'enable' | 'archive') =>
      async (request: FastifyRequest, reply: FastifyReply) => {
        await service.setStatus(
          staffParams.parse(request.params).userId,
          action,
          request.actor!.userId,
        )
        return reply.code(204).send()
      },
    async create(request: FastifyRequest, reply: FastifyReply) {
      const result = await service.create(
        createStaffSchema.parse(request.body),
        request.actor!.userId,
      )
      return reply.code(201).send({
        ...toStaff(result.user),
        temporaryPassword: result.temporaryPassword,
        temporaryPasswordExpiresAt: result.temporaryPasswordExpiresAt.toISOString(),
      } satisfies StaffOnboarding)
    },
    async reissueTemporary(request: FastifyRequest): Promise<TemporaryPassword> {
      const result = await service.reissueTemporary(
        staffParams.parse(request.params).userId,
        request.actor!.userId,
      )
      return {
        temporaryPassword: result.temporaryPassword,
        temporaryPasswordExpiresAt: result.temporaryPasswordExpiresAt.toISOString(),
      }
    },
  }
}
