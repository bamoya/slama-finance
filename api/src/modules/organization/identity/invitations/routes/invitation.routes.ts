import type { FastifyInstance, preHandlerHookHandler } from 'fastify'

import type { createInvitationController } from '../controllers/invitation.controller.js'

export function registerInvitationRoutes(
  app: FastifyInstance,
  controller: ReturnType<typeof createInvitationController>,
  permission: (key: string) => preHandlerHookHandler,
) {
  const config = { rateLimit: { max: 5, timeWindow: '1 minute' } }
  app.get('/api/v1/staff/invitations', { preHandler: permission('staff.read') }, controller.list)
  app.post(
    '/api/v1/staff/invitations',
    { config, preHandler: permission('staff.create') },
    controller.create,
  )
  app.post(
    '/api/v1/staff/invitations/:invitationId/resend',
    { config, preHandler: permission('staff.update') },
    controller.resend,
  )
  app.post(
    '/api/v1/staff/invitations/:invitationId/revoke',
    { preHandler: permission('staff.update') },
    controller.revoke,
  )
  app.post('/api/v1/organization-auth/invitations/inspect', { config }, controller.inspect)
  app.post('/api/v1/organization-auth/invitations/accept', { config }, controller.accept)
}
