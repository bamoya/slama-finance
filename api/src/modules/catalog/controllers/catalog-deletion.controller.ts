import type { FastifyReply, FastifyRequest } from 'fastify'

import {
  CatalogDeletionSelectionSchema,
  ConfirmCatalogDeletionSchema,
} from '../../../contracts/generated/catalog/deletion.schemas.js'
import type { createCatalogDeletionService } from '../services/catalog-deletion.service.js'

export function createCatalogDeletionController(
  service: ReturnType<typeof createCatalogDeletionService>,
) {
  return {
    preview(request: FastifyRequest) {
      return service.preview(
        CatalogDeletionSelectionSchema.parse(request.body),
        request.actor!.userId,
      )
    },
    async confirm(request: FastifyRequest, reply: FastifyReply) {
      await service.confirm(ConfirmCatalogDeletionSchema.parse(request.body), request.actor!.userId)
      return reply.code(204).send()
    },
  }
}
