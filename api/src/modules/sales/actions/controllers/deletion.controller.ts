import type { FastifyReply, FastifyRequest } from 'fastify'

import {
  ConfirmSalesDeletionSchema,
  SalesDeletionSelectionSchema,
} from '../../../../contracts/generated/sales/actions.schemas.js'
import type { createSalesDeletionService } from '../services/sales-deletion.service.js'

export function createDeletionController(service: ReturnType<typeof createSalesDeletionService>) {
  return {
    preview(request: FastifyRequest) {
      return service.preview(
        SalesDeletionSelectionSchema.parse(request.body),
        request.actor!.userId,
      )
    },
    async confirm(request: FastifyRequest, reply: FastifyReply) {
      await service.confirm(ConfirmSalesDeletionSchema.parse(request.body), request.actor!.userId)
      return reply.code(204).send()
    },
  }
}
