import type { FastifyReply, FastifyRequest } from 'fastify'

import {
  EstimateCancellationSchema,
  EstimateInputSchema,
  EstimateUpdateSchema,
  EstimateVersionSchema,
  getEstimateParamsSchema,
  issueEstimateParamsSchema,
  listEstimatesQuerySchema,
} from '../../../../contracts/generated/sales/estimates.schemas.js'
import type { createEstimateService } from '../services/estimate.service.js'

const id = (request: FastifyRequest) => getEstimateParamsSchema.parse(request.params).id

export function createEstimateController(service: ReturnType<typeof createEstimateService>) {
  return {
    createRevision(request: FastifyRequest) {
      return service.createRevision(
        id(request),
        EstimateVersionSchema.parse(request.body).expectedVersion,
        request.actor!.userId,
      )
    },
    list(request: FastifyRequest) {
      const { page, pageSize, ...filters } = listEstimatesQuerySchema.parse(request.query)
      const limit = pageSize ?? filters.limit
      return service.list({ ...filters, limit, offset: page ? (page - 1) * limit : filters.offset })
    },
    get(request: FastifyRequest) {
      return service.get(id(request))
    },
    async create(request: FastifyRequest, reply: FastifyReply) {
      return reply
        .code(201)
        .send(await service.create(EstimateInputSchema.parse(request.body), request.actor!.userId))
    },
    update(request: FastifyRequest) {
      return service.update(
        id(request),
        EstimateUpdateSchema.parse(request.body),
        request.actor!.userId,
      )
    },
    async delete(request: FastifyRequest, reply: FastifyReply) {
      await service.delete(
        id(request),
        EstimateVersionSchema.parse(request.body).expectedVersion,
        request.actor!.userId,
      )
      return reply.code(204).send()
    },
    issue(request: FastifyRequest) {
      return service.issue(
        issueEstimateParamsSchema.parse(request.params).id,
        EstimateVersionSchema.parse(request.body).expectedVersion,
        request.actor!.userId,
      )
    },
    accept(request: FastifyRequest) {
      return service.accept(
        id(request),
        EstimateVersionSchema.parse(request.body).expectedVersion,
        request.actor!.userId,
      )
    },
    reject(request: FastifyRequest) {
      return service.reject(
        id(request),
        EstimateVersionSchema.parse(request.body).expectedVersion,
        request.actor!.userId,
      )
    },
    cancel(request: FastifyRequest) {
      const input = EstimateCancellationSchema.parse(request.body)
      return service.cancel(id(request), input.expectedVersion, request.actor!.userId, input.reason)
    },
    async pdf(request: FastifyRequest, reply: FastifyReply) {
      return reply.code(202).send(await service.preparePdf(id(request), request.actor!.userId))
    },
    artifacts(request: FastifyRequest) {
      return service.artifacts(id(request), request.actor!.userId)
    },
  }
}
