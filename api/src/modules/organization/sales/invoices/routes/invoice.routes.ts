import type { FastifyInstance, preHandlerHookHandler } from 'fastify'

import type { createInvoiceController } from '../controllers/invoice.controller.js'

export function registerInvoiceRoutes(
  app: FastifyInstance,
  c: ReturnType<typeof createInvoiceController>,
  permission: (key: string) => preHandlerHookHandler,
) {
  app.post(
    '/invoices/from-deliveries',
    { preHandler: permission('invoices.create') },
    c.fromDeliveries,
  )
  app.get('/invoices', { preHandler: permission('invoices.read') }, c.list)
  app.get('/invoices/:id', { preHandler: permission('invoices.read') }, c.get)
  app.post('/invoices', { preHandler: permission('invoices.create') }, c.create)
  app.patch('/invoices/:id', { preHandler: permission('invoices.update') }, c.update)
  app.delete('/invoices/:id', { preHandler: permission('invoices.delete') }, c.delete)
  app.post('/invoices/:id/issue', { preHandler: permission('invoices.update') }, c.issue)
  app.post('/invoices/:id/cancel', { preHandler: permission('invoices.update') }, c.cancel)
  app.post('/invoices/:id/pdf', { preHandler: permission('invoices.read') }, c.pdf)
  app.get('/invoices/:id/artifacts', { preHandler: permission('invoices.read') }, c.artifacts)
  app.get('/estimates/:id/invoices', { preHandler: permission('estimates.read') }, c.linked)
  app.post('/estimates/:id/invoices', { preHandler: permission('invoices.create') }, c.fromEstimate)
}
