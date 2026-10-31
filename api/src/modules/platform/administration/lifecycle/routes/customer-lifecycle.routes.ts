import type { FastifyInstance } from 'fastify'

import type { createCustomerLifecycleController } from '../controllers/customer-lifecycle.controller.js'

export function registerCustomerLifecycleRoutes(
  app: FastifyInstance,
  controller: ReturnType<typeof createCustomerLifecycleController>,
) {
  app.post('/owners', controller.create)
  app.post('/owners/:ownerId/invitation', controller.resendInvitation)
  app.post('/owners/:ownerId/block', controller.block)
  app.post('/owners/:ownerId/unblock', controller.unblock)
  app.post('/owners/:ownerId/deletion', controller.scheduleDeletion)
  app.post('/owners/:ownerId/deletion/cancel', controller.cancelDeletion)
  app.post('/owners/:ownerId/subscription/suspend', controller.suspendSubscription)
  app.post('/owners/:ownerId/subscription/resume', controller.resumeSubscription)
  app.post('/owners/:ownerId/subscription/plan', controller.changePlan)
  app.post('/owners/:ownerId/subscription/extension', controller.extend)
  app.post('/organizations/:organizationId/suspend', controller.suspendOrganization)
  app.post('/organizations/:organizationId/reactivate', controller.reactivateOrganization)
}
