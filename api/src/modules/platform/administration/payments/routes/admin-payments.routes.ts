import type { FastifyInstance } from 'fastify'

import type { createAdminPaymentsController } from '../controllers/admin-payments.controller.js'

export function registerAdminPaymentsRoutes(
  app: FastifyInstance,
  controller: ReturnType<typeof createAdminPaymentsController>,
) {
  app.get('/payments', controller.list)
  app.post('/payments/:paymentId/confirm', controller.confirm)
  app.post('/payments/:paymentId/reject', controller.reject)
  app.get('/invoices', controller.invoices)
  app.get('/invoices/:invoiceId/pdf', controller.invoicePdf)
  app.post('/invoices/:invoiceId/credit-notes', controller.creditNote)
}
