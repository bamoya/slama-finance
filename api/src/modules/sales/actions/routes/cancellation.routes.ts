import type { FastifyInstance, preHandlerHookHandler } from 'fastify'

import type { createCancellationController } from '../controllers/cancellation.controller.js'

export function registerCancellationRoutes(
  app: FastifyInstance,
  controller: ReturnType<typeof createCancellationController>,
  permission: (key: string) => preHandlerHookHandler,
) {
  app.post(
    '/invoices/cancellation/preview',
    { preHandler: permission('invoices.update') },
    controller.preview,
  )
  app.post(
    '/invoices/cancellation',
    { preHandler: permission('invoices.update') },
    controller.confirm,
  )
}
