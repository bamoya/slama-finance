import type { FastifyReply, FastifyRequest } from 'fastify'

import {
  ClientDeletionSelectionSchema,
  ConfirmClientDeletionSchema,
} from '../../../contracts/generated/clients/deletion.schemas.js'
import type { createClientDeletionService } from '../services/client-deletion.service.js'

export function createClientDeletionController(
  service: ReturnType<typeof createClientDeletionService>,
) {
  return {
    preview(request: FastifyRequest) {
      return service.preview(
        ClientDeletionSelectionSchema.parse(request.body),
        request.actor!.userId,
      )
    },
    async confirm(request: FastifyRequest, reply: FastifyReply) {
      await service.confirm(ConfirmClientDeletionSchema.parse(request.body), request.actor!.userId)
      return reply.code(204).send()
    },
  }
}
