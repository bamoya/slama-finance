import type { FastifyReply, FastifyRequest } from 'fastify'

import {
  DeliveryInvoiceConversionSchema,
  getInvoiceParamsSchema,
  InvoiceCancellationSchema,
  InvoiceConversionSchema,
  InvoiceInputSchema,
  InvoiceUpdateSchema,
  InvoiceVersionSchema,
  listInvoicesFromEstimateParamsSchema,
  listInvoicesQuerySchema,
} from '../../../../contracts/generated/sales/invoices.schemas.js'
import type { createInvoiceService } from '../services/invoice.service.js'

const id = (request: FastifyRequest) => getInvoiceParamsSchema.parse(request.params).id
const estimateId = (request: FastifyRequest) =>
  listInvoicesFromEstimateParamsSchema.parse(request.params).id

export function createInvoiceController(service: ReturnType<typeof createInvoiceService>) {
  return {
    list(request: FastifyRequest) {
      const query = request.query as Record<string, unknown>
      const { page, pageSize, ...filters } = listInvoicesQuerySchema.parse({
        ...query,
        overdue:
          query.overdue === undefined
            ? undefined
            : query.overdue === 'true'
              ? true
              : query.overdue === 'false'
                ? false
                : query.overdue,
      })
      const limit = pageSize ?? filters.limit
      return service.list({ ...filters, limit, offset: page ? (page - 1) * limit : filters.offset })
    },
    get(request: FastifyRequest) {
      return service.get(id(request))
    },
    async create(request: FastifyRequest, reply: FastifyReply) {
      return reply
        .code(201)
        .send(await service.create(InvoiceInputSchema.parse(request.body), request.actor!.userId))
    },
    update(request: FastifyRequest) {
      return service.update(
        id(request),
        InvoiceUpdateSchema.parse(request.body),
        request.actor!.userId,
      )
    },
    async delete(request: FastifyRequest, reply: FastifyReply) {
      await service.delete(
        id(request),
        InvoiceVersionSchema.parse(request.body).expectedVersion,
        request.actor!.userId,
      )
      return reply.code(204).send()
    },
    issue(request: FastifyRequest) {
      return service.issue(
        id(request),
        InvoiceVersionSchema.parse(request.body).expectedVersion,
        request.actor!.userId,
      )
    },
    cancel(request: FastifyRequest) {
      const input = InvoiceCancellationSchema.parse(request.body)
      return service.cancel(id(request), input.expectedVersion, request.actor!.userId, input.reason)
    },
    async pdf(request: FastifyRequest, reply: FastifyReply) {
      return reply.code(202).send(await service.preparePdf(id(request), request.actor!.userId))
    },
    artifacts(request: FastifyRequest) {
      return service.artifacts(id(request), request.actor!.userId)
    },
    async fromEstimate(request: FastifyRequest, reply: FastifyReply) {
      return reply
        .code(201)
        .send(
          await service.fromEstimate(
            estimateId(request),
            InvoiceConversionSchema.parse(request.body),
            request.actor!.userId,
          ),
        )
    },
    async fromDeliveries(request: FastifyRequest, reply: FastifyReply) {
      return reply
        .code(201)
        .send(
          await service.fromDeliveries(
            DeliveryInvoiceConversionSchema.parse(request.body),
            request.actor!.userId,
          ),
        )
    },
    linked(request: FastifyRequest) {
      return service.linkedToEstimate(estimateId(request), request.actor!.userId)
    },
  }
}
