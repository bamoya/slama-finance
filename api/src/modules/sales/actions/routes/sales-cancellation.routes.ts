import type { FastifyInstance, preHandlerHookHandler } from 'fastify'

import {
  ConfirmSalesCancellationSchema,
  SalesCancellationSelectionSchema,
} from '../../../../contracts/generated/sales/cancellation.schemas.js'
import type { createSalesCancellationController } from '../controllers/sales-cancellation.controller.js'

export function registerSalesCancellationRoutes(
  app: FastifyInstance,
  controller: ReturnType<typeof createSalesCancellationController>,
  permission: (key: string) => preHandlerHookHandler,
) {
  const authorize = (confirm: boolean): preHandlerHookHandler =>
    async function (request, reply) {
      const { resource } = (
        confirm ? ConfirmSalesCancellationSchema : SalesCancellationSelectionSchema
      ).parse(request.body)
      await permission(`${resource}.update`).call(this, request, reply, () => {})
    }
  app.post('/sales/cancellation/preview', { preHandler: authorize(false) }, controller.preview)
  app.post('/sales/cancellation', { preHandler: authorize(true) }, controller.confirm)
}
