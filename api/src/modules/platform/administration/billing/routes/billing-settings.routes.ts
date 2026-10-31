import type { FastifyInstance } from 'fastify'

import type { createBillingSettingsController } from '../controllers/billing-settings.controller.js'

export function registerBillingSettingsRoutes(
  app: FastifyInstance,
  controller: ReturnType<typeof createBillingSettingsController>,
) {
  app.get('/billing-settings', controller.get)
  app.put('/billing-settings', controller.update)
}
