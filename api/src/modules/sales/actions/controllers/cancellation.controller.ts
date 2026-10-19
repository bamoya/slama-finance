import type { FastifyReply, FastifyRequest } from 'fastify'

import {
  ConfirmInvoiceCancellationSchema,
  InvoiceCancellationSelectionSchema,
} from '../../../../contracts/generated/sales/actions.schemas.js'
import type { createInvoiceCancellationService } from '../services/invoice-cancellation.service.js'

export function createCancellationController(
  service: ReturnType<typeof createInvoiceCancellationService>,
) {
  return {
    preview(request: FastifyRequest) {
      return service.preview(
        InvoiceCancellationSelectionSchema.parse(request.body),
        request.actor!.userId,
      )
    },
    async confirm(request: FastifyRequest, reply: FastifyReply) {
      await service.confirm(
        ConfirmInvoiceCancellationSchema.parse(request.body),
        request.actor!.userId,
      )
      return reply.code(204).send()
    },
  }
}
