import type { FastifyInstance } from 'fastify'

import { createRequirePortalOrigin } from '../../../../middlewares/require-portal-origin.js'
import type { createAdminController } from '../controllers/admin.controller.js'

/** Mounted at /v1/admin. The portal is served by the owner portal origin under /admin. */
export async function registerAdminRoutes(
  app: FastifyInstance,
  controller: ReturnType<typeof createAdminController>,
  portalOrigin?: string,
) {
  app.addHook('onRequest', createRequirePortalOrigin(portalOrigin))
  const limited = { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }
  app.post('/auth/login', limited, controller.login)
  app.post(
    '/auth/2fa',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    controller.verify,
  )
  app.post('/auth/logout', controller.logout)
  await app.register(async (scope) => {
    scope.addHook('preHandler', controller.requireAdmin)
    scope.get('/auth/me', controller.me)
    scope.get('/payments', controller.payments)
    scope.post('/payments/:paymentId/confirm', controller.confirm)
    scope.post('/payments/:paymentId/reject', controller.reject)
    scope.get('/owners', controller.owners)
    scope.get('/owners/:ownerId', controller.owner)
    scope.get('/billing-settings', controller.settings)
    scope.put('/billing-settings', controller.updateSettings)
    scope.get('/audit', controller.audit)
  })
}
