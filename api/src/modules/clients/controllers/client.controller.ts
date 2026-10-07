import type { FastifyReply, FastifyRequest } from 'fastify'

import {
  ClientInputSchema,
  ClientUpdateSchema,
  ClientVersionSchema,
  getClientOverviewParamsSchema,
  getClientParamsSchema,
  listClientsQuerySchema,
} from '../../../contracts/generated/clients/clients.schemas.js'
import type { createClientService } from '../services/client.service.js'

export function createClientController(service: ReturnType<typeof createClientService>) {
  return {
    list(r: FastifyRequest) {
      const query = r.query as Record<string, unknown>
      const { page, pageSize, ...filters } = listClientsQuerySchema.parse({
        ...query,
        overdueOnly:
          query.overdueOnly === undefined
            ? undefined
            : query.overdueOnly === 'true'
              ? true
              : query.overdueOnly === 'false'
                ? false
                : query.overdueOnly,
      })
      const limit = pageSize ?? filters.limit
      return service.list(
        {
          ...filters,
          q: filters.q ?? '',
          limit,
          offset: page ? (page - 1) * limit : filters.offset,
        },
        r.actor!.userId,
      )
    },
    get(r: FastifyRequest) {
      return service.get(getClientParamsSchema.parse(r.params).id)
    },
    overview(r: FastifyRequest) {
      return service.overview(getClientOverviewParamsSchema.parse(r.params).id, r.actor!.userId)
    },
    async create(r: FastifyRequest, reply: FastifyReply) {
      return reply
        .code(201)
        .send(await service.create(ClientInputSchema.parse(r.body), r.actor!.userId))
    },
    update(r: FastifyRequest) {
      return service.update(
        getClientParamsSchema.parse(r.params).id,
        ClientUpdateSchema.parse(r.body),
        r.actor!.userId,
      )
    },
    archive(r: FastifyRequest) {
      return service.changeStatus(
        getClientParamsSchema.parse(r.params).id,
        ClientVersionSchema.parse(r.body).expectedVersion,
        r.actor!.userId,
        false,
      )
    },
    restore(r: FastifyRequest) {
      return service.changeStatus(
        getClientParamsSchema.parse(r.params).id,
        ClientVersionSchema.parse(r.body).expectedVersion,
        r.actor!.userId,
        true,
      )
    },
    async delete(r: FastifyRequest, reply: FastifyReply) {
      await service.delete(
        getClientParamsSchema.parse(r.params).id,
        ClientVersionSchema.parse(r.body).expectedVersion,
        r.actor!.userId,
      )
      return reply.code(204).send()
    },
  }
}
