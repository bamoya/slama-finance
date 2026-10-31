import type { FastifyInstance, preHandlerHookHandler } from 'fastify'

import { organizationStaffInspectInvitationParamsSchema } from '../../../../../contracts/generated/identity/staff-invitations.schemas.js'
import type { createInvitationController } from '../controllers/invitation.controller.js'

export function registerInvitationRoutes(
  app: FastifyInstance,
  controller: ReturnType<typeof createInvitationController>,
  permission: (key: string) => preHandlerHookHandler,
) {
  const config = { rateLimit: { max: 5, timeWindow: '1 minute' } }
  app.get('/v1/staff/invitations', { preHandler: permission('staff.read') }, controller.list)
  app.post(
    '/v1/staff/invitations',
    { config, preHandler: permission('staff.create') },
    controller.create,
  )
  app.post(
    '/v1/staff/invitations/:invitationId/resend',
    { config, preHandler: permission('staff.update') },
    controller.resend,
  )
  app.post(
    '/v1/staff/invitations/:invitationId/revoke',
    { preHandler: permission('staff.update') },
    controller.revoke,
  )
  const validate = async (request: Parameters<typeof controller.inspect>[0]) => {
    organizationStaffInspectInvitationParamsSchema.parse(request.params)
  }
  app.post(
    '/v1/organizations/:organizationId/auth/invitations/inspect',
    { config, preHandler: validate },
    controller.inspect,
  )
  app.post(
    '/v1/organizations/:organizationId/auth/invitations/accept',
    { config, preHandler: validate },
    controller.accept,
  )
}
