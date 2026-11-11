import type { FastifyInstance } from 'fastify'

import type { createSubscriptionController } from '../controllers/subscription.controller.js'
export function registerSubscriptionRoutes(
  app: FastifyInstance,
  controller: ReturnType<typeof createSubscriptionController>,
) {
  app.get('/api/v1/owner/subscription', controller.get)
  app.get('/api/v1/owner/subscription/billing', controller.billing)
  app.put('/api/v1/owner/subscription/billing', controller.saveCustomer)
  app.post('/api/v1/owner/subscription/quote', controller.quote)
  app.get('/api/v1/owner/subscription/payments', controller.payments)
  app.post(
    '/api/v1/owner/subscription/payments',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    controller.submit,
  )
  app.get('/api/v1/owner/subscription/invoices', controller.invoices)
  app.get('/api/v1/owner/subscription/invoices/:invoiceId/pdf', controller.invoicePdf)
  app.put('/api/v1/owner/subscription/cancellation', controller.cancellation)
}
