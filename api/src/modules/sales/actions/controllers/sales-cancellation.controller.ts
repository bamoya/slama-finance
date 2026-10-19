import type { FastifyReply, FastifyRequest } from 'fastify'

import {
  ConfirmSalesCancellationSchema,
  SalesCancellationSelectionSchema,
} from '../../../../contracts/generated/sales/cancellation.schemas.js'
import type { createSalesCancellationService } from '../services/sales-cancellation.service.js'

export function createSalesCancellationController(
  service: ReturnType<typeof createSalesCancellationService>,
) {
  return {
    preview(request: FastifyRequest) {
      return service.preview(
        SalesCancellationSelectionSchema.parse(request.body),
        request.actor!.userId,
      )
    },
    async confirm(request: FastifyRequest, reply: FastifyReply) {
      await service.confirm(
        ConfirmSalesCancellationSchema.parse(request.body),
        request.actor!.userId,
      )
      return reply.code(204).send()
    },
  }
}
