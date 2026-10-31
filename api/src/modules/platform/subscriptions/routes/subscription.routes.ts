import type { FastifyInstance } from 'fastify'

import { createRequirePortalOrigin } from '../../../../middlewares/require-portal-origin.js'
import type { createSubscriptionController } from '../controllers/subscription.controller.js'
export function registerSubscriptionRoutes(
  app: FastifyInstance,
  controller: ReturnType<typeof createSubscriptionController>,
  origin?: string,
) {
  app.get(
    '/v1/owner/subscription',
    { preHandler: createRequirePortalOrigin(origin) },
    controller.get,
  )
}
