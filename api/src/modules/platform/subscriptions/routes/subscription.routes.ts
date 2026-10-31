import type { FastifyInstance } from 'fastify'

import { createRequirePortalOrigin } from '../../../../middlewares/require-portal-origin.js'
import type { createSubscriptionController } from '../controllers/subscription.controller.js'
export function registerSubscriptionRoutes(
  app: FastifyInstance,
  controller: ReturnType<typeof createSubscriptionController>,
  origin?: string,
) {
  const preHandler = createRequirePortalOrigin(origin)
  app.get('/api/v1/owner/subscription', { preHandler }, controller.get)
  app.get('/api/v1/owner/subscription/billing', { preHandler }, controller.billing)
  app.post('/api/v1/owner/subscription/quote', { preHandler }, controller.quote)
  app.get('/api/v1/owner/subscription/payments', { preHandler }, controller.payments)
  app.post(
    '/api/v1/owner/subscription/payments',
    { preHandler, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    controller.submit,
  )
  app.put('/api/v1/owner/subscription/cancellation', { preHandler }, controller.cancellation)
}
