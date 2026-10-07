import type { FastifyReply, FastifyRequest } from 'fastify'

import {
  getPaymentParamsSchema,
  listPaymentsQuerySchema,
  PaymentCancellationSchema,
  PaymentConfirmationSchema,
  PaymentInputSchema,
  PaymentVersionSchema,
} from '../../../../contracts/generated/sales/payments.schemas.js'
import type { createPaymentService } from '../services/payment.service.js'
import type { createPaymentReceiptService } from '../services/payment-receipt.service.js'

const id = (request: FastifyRequest) => getPaymentParamsSchema.parse(request.params).id

export function createPaymentController(
  service: ReturnType<typeof createPaymentService>,
  receipts: ReturnType<typeof createPaymentReceiptService>,
) {
  return {
    receipt(request: FastifyRequest) {
      return receipts.download(id(request), request.actor!.userId)
    },
    list(request: FastifyRequest) {
      return service.list(listPaymentsQuerySchema.parse(request.query))
    },
    get(request: FastifyRequest) {
      return service.get(id(request))
    },
    async create(request: FastifyRequest, reply: FastifyReply) {
      return reply
        .code(201)
        .send(await service.create(PaymentInputSchema.parse(request.body), request.actor!.userId))
    },
    confirm(request: FastifyRequest) {
      const input = PaymentConfirmationSchema.parse(request.body)
      return service.confirm(
        id(request),
        input.expectedVersion,
        input.collectedOn,
        request.actor!.userId,
      )
    },
    cancel(request: FastifyRequest) {
      const input = PaymentCancellationSchema.parse(request.body)
      return service.cancel(id(request), input.expectedVersion, input.reason, request.actor!.userId)
    },
    restore(request: FastifyRequest) {
      const input = PaymentVersionSchema.parse(request.body)
      return service.restore(id(request), input.expectedVersion, request.actor!.userId)
    },
    async delete(request: FastifyRequest, reply: FastifyReply) {
      const input = PaymentVersionSchema.parse(request.body)
      await service.delete(id(request), input.expectedVersion, request.actor!.userId)
      return reply.code(204).send()
    },
  }
}
