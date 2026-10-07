import type { FastifyReply, FastifyRequest } from 'fastify'

import {
  DeliveryNoteAcknowledgmentSchema,
  DeliveryNoteCancellationSchema,
  DeliveryNoteInputSchema,
  DeliveryNoteUpdateSchema,
  DeliveryNoteVersionSchema,
  getDeliveryNoteParamsSchema,
  listDeliveryNotesQuerySchema,
} from '../../../../contracts/generated/sales/delivery-notes.schemas.js'
import type { createDeliveryNoteService } from '../services/delivery-note.service.js'

const id = (request: FastifyRequest) => getDeliveryNoteParamsSchema.parse(request.params).id

export function createDeliveryNoteController(
  service: ReturnType<typeof createDeliveryNoteService>,
) {
  return {
    list(request: FastifyRequest) {
      const { page, pageSize, ...filters } = listDeliveryNotesQuerySchema.parse(request.query)
      const limit = pageSize ?? filters.limit
      return service.list({ ...filters, limit, offset: page ? (page - 1) * limit : filters.offset })
    },
    get(request: FastifyRequest) {
      return service.get(id(request))
    },
    async create(request: FastifyRequest, reply: FastifyReply) {
      return reply
        .code(201)
        .send(
          await service.create(DeliveryNoteInputSchema.parse(request.body), request.actor!.userId),
        )
    },
    update(request: FastifyRequest) {
      return service.update(
        id(request),
        DeliveryNoteUpdateSchema.parse(request.body),
        request.actor!.userId,
      )
    },
    async delete(request: FastifyRequest, reply: FastifyReply) {
      await service.delete(
        id(request),
        DeliveryNoteVersionSchema.parse(request.body).expectedVersion,
        request.actor!.userId,
      )
      return reply.code(204).send()
    },
    prepare(request: FastifyRequest) {
      return service.prepare(
        id(request),
        DeliveryNoteVersionSchema.parse(request.body).expectedVersion,
        request.actor!.userId,
      )
    },
    deliver(request: FastifyRequest) {
      return service.deliver(
        id(request),
        DeliveryNoteVersionSchema.parse(request.body).expectedVersion,
        request.actor!.userId,
      )
    },
    acknowledge(request: FastifyRequest) {
      const input = DeliveryNoteAcknowledgmentSchema.parse(request.body)
      return service.acknowledge(
        id(request),
        input.expectedVersion,
        input.receivedByName,
        request.actor!.userId,
      )
    },
    cancel(request: FastifyRequest) {
      const input = DeliveryNoteCancellationSchema.parse(request.body)
      return service.cancel(id(request), input.expectedVersion, input.reason, request.actor!.userId)
    },
    async pdf(request: FastifyRequest, reply: FastifyReply) {
      return reply.code(202).send(await service.preparePdf(id(request), request.actor!.userId))
    },
    artifacts(request: FastifyRequest) {
      return service.artifacts(id(request), request.actor!.userId)
    },
  }
}
