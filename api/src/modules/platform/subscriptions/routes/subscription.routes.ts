import type { FastifyInstance } from 'fastify'

import { createRequirePortalOrigin } from '../../../../middlewares/require-portal-origin.js'
import type { createSubscriptionController } from '../controllers/subscription.controller.js'
export function registerSubscriptionRoutes(
  app: FastifyInstance,
  controller: ReturnType<typeof createSubscriptionController>,
  origin?: string,
) {
  const preHandler = createRequirePortalOrigin(origin)
  app.get('/v1/owner/subscription', { preHandler }, controller.get)
  app.get('/v1/owner/subscription/billing', { preHandler }, controller.billing)
  app.post('/v1/owner/subscription/quote', { preHandler }, controller.quote)
  app.get('/v1/owner/subscription/payments', { preHandler }, controller.payments)
  app.post(
    '/v1/owner/subscription/payments',
    { preHandler, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    controller.submit,
  )
  app.put('/v1/owner/subscription/cancellation', { preHandler }, controller.cancellation)
}
