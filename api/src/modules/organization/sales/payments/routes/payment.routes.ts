import type { FastifyInstance, preHandlerHookHandler } from 'fastify'

import type { createPaymentController } from '../controllers/payment.controller.js'

export function registerPaymentRoutes(
  app: FastifyInstance,
  c: ReturnType<typeof createPaymentController>,
  permission: (key: string) => preHandlerHookHandler,
) {
  app.get('/payments', { preHandler: permission('payments.read') }, c.list)
  app.get('/payments/:id', { preHandler: permission('payments.read') }, c.get)
  app.post('/payments/:id/receipt', { preHandler: permission('payments.read') }, c.receipt)
  app.delete('/payments/:id', { preHandler: permission('payments.delete') }, c.delete)
  app.post('/payments', { preHandler: permission('payments.create') }, c.create)
  app.post('/payments/:id/confirm', { preHandler: permission('payments.update') }, c.confirm)
  app.post('/payments/:id/cancel', { preHandler: permission('payments.update') }, c.cancel)
  app.post('/payments/:id/restore', { preHandler: permission('payments.update') }, c.restore)
}
