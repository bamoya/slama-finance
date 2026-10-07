import type { FastifyReply, FastifyRequest } from 'fastify'

import {
  cancelDocumentNotificationParamsSchema,
  cancelNotificationPreparationParamsSchema,
  listDocumentNotificationsParamsSchema,
  listDocumentNotificationsQuerySchema,
  retryDocumentNotificationParamsSchema,
  retryNotificationPreparationParamsSchema,
  SendDocumentInputSchema,
  sendEstimateParamsSchema,
  sendInvoiceParamsSchema,
} from '../../../../contracts/generated/sales/notifications.schemas.js'
import type { createSalesNotificationService } from '../services/sales-notification.service.js'

export function createSalesNotificationController(
  service: ReturnType<typeof createSalesNotificationService>,
) {
  return {
    sendInvoice: async (r: FastifyRequest, reply: FastifyReply) =>
      reply
        .code(202)
        .send(
          await service.send(
            'invoice',
            sendInvoiceParamsSchema.parse(r.params).id,
            SendDocumentInputSchema.parse(r.body),
            r.actor!.userId,
          ),
        ),
    sendEstimate: async (r: FastifyRequest, reply: FastifyReply) =>
      reply
        .code(202)
        .send(
          await service.send(
            'estimate',
            sendEstimateParamsSchema.parse(r.params).id,
            SendDocumentInputSchema.parse(r.body),
            r.actor!.userId,
          ),
        ),
    list: (r: FastifyRequest) => {
      const p = listDocumentNotificationsParamsSchema.parse(r.params)
      const q = listDocumentNotificationsQuerySchema.parse(r.query)
      return service.timeline(p.documentType, p.id, q.limit, q.offset, r.actor!.userId)
    },
    retry: (r: FastifyRequest) => {
      const p = retryDocumentNotificationParamsSchema.parse(r.params)
      return service.dispatchAction(p.documentType, p.id, p.dispatchId, 'retry', r.actor!.userId)
    },
    cancel: (r: FastifyRequest) => {
      const p = cancelDocumentNotificationParamsSchema.parse(r.params)
      return service.dispatchAction(p.documentType, p.id, p.dispatchId, 'cancel', r.actor!.userId)
    },
    retryPreparation: (r: FastifyRequest) => {
      const p = retryNotificationPreparationParamsSchema.parse(r.params)
      return service.preparationAction(p.documentType, p.id, p.jobId, 'retry', r.actor!.userId)
    },
    cancelPreparation: (r: FastifyRequest) => {
      const p = cancelNotificationPreparationParamsSchema.parse(r.params)
      return service.preparationAction(p.documentType, p.id, p.jobId, 'cancel', r.actor!.userId)
    },
  }
}
