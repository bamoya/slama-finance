import type { FastifyInstance, preHandlerHookHandler } from 'fastify'

import type { createSalesNotificationController } from '../controllers/sales-notification.controller.js'

export function registerSalesNotificationRoutes(
  app: FastifyInstance,
  c: ReturnType<typeof createSalesNotificationController>,
  permission: (key: string) => preHandlerHookHandler,
) {
  app.post(
    '/invoices/:id/send',
    {
      preHandler: [permission('invoices.read'), permission('invoices.update')],
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    c.sendInvoice,
  )
  app.post(
    '/estimates/:id/send',
    {
      preHandler: [permission('estimates.read'), permission('estimates.update')],
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    c.sendEstimate,
  )
  app.get(
    '/documents/:documentType/:id/notifications',
    { preHandler: permission('notification_dispatches.read') },
    c.list,
  )
  app.post(
    '/documents/:documentType/:id/notifications/:dispatchId/retry',
    { preHandler: permission('notification_dispatches.update') },
    c.retry,
  )
  app.post(
    '/documents/:documentType/:id/notifications/:dispatchId/cancel',
    { preHandler: permission('notification_dispatches.update') },
    c.cancel,
  )
  app.post(
    '/documents/:documentType/:id/notification-preparations/:jobId/retry',
    { preHandler: permission('notification_dispatches.update') },
    c.retryPreparation,
  )
  app.post(
    '/documents/:documentType/:id/notification-preparations/:jobId/cancel',
    { preHandler: permission('notification_dispatches.update') },
    c.cancelPreparation,
  )
}
