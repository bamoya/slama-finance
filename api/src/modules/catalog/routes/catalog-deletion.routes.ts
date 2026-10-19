import type { FastifyInstance, preHandlerHookHandler } from 'fastify'

import {
  CatalogDeletionSelectionSchema,
  ConfirmCatalogDeletionSchema,
} from '../../../contracts/generated/catalog/deletion.schemas.js'
import type { createCatalogDeletionController } from '../controllers/catalog-deletion.controller.js'

export function registerCatalogDeletionRoutes(
  app: FastifyInstance,
  controller: ReturnType<typeof createCatalogDeletionController>,
  permission: (key: string) => preHandlerHookHandler,
) {
  const authorize = (confirm: boolean): preHandlerHookHandler =>
    async function (request, reply) {
      const { resource } = (
        confirm ? ConfirmCatalogDeletionSchema : CatalogDeletionSelectionSchema
      ).parse(request.body)
      await permission(`${resource}.delete`).call(this, request, reply, () => {})
    }
  app.post('/catalog/deletion/preview', { preHandler: authorize(false) }, controller.preview)
  app.post('/catalog/deletion', { preHandler: authorize(true) }, controller.confirm)
}
