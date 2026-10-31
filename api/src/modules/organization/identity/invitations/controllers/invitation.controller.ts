import type { FastifyReply, FastifyRequest } from 'fastify'

import {
  AcceptStaffInvitationInputSchema,
  CreateStaffInvitationSchema,
  InspectStaffInvitationInputSchema,
  listStaffInvitationsQuerySchema,
  resendStaffInvitationParamsSchema,
  revokeStaffInvitationParamsSchema,
} from '../../../../../contracts/generated/identity/staff-invitations.schemas.js'
import type { createInvitationService } from '../services/invitation.service.js'

export function createInvitationController(service: ReturnType<typeof createInvitationService>) {
  return {
    list: (request: FastifyRequest) =>
      service.list(listStaffInvitationsQuerySchema.parse(request.query)),
    async create(request: FastifyRequest, reply: FastifyReply) {
      const body = request.body as Record<string, unknown> | null
      const input =
        body && typeof body.email === 'string'
          ? { ...body, email: body.email.trim() }
          : request.body
      return reply
        .code(201)
        .send(await service.create(CreateStaffInvitationSchema.parse(input), request.actor!.userId))
    },
    resend: (request: FastifyRequest) =>
      service.resend(
        resendStaffInvitationParamsSchema.parse(request.params).invitationId,
        request.actor!.userId,
      ),
    revoke: (request: FastifyRequest) =>
      service.revoke(
        revokeStaffInvitationParamsSchema.parse(request.params).invitationId,
        request.actor!.userId,
      ),
    inspect: (request: FastifyRequest) =>
      service.inspect(InspectStaffInvitationInputSchema.parse(request.body).token),
    accept: (request: FastifyRequest) =>
      service.accept(AcceptStaffInvitationInputSchema.parse(request.body)),
  }
}
