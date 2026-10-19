import type { FastifyInstance, preHandlerHookHandler } from 'fastify'

import type { createClientDeletionController } from '../controllers/client-deletion.controller.js'

export function registerClientDeletionRoutes(
  app: FastifyInstance,
  controller: ReturnType<typeof createClientDeletionController>,
  permission: (key: string) => preHandlerHookHandler,
) {
  app.post(
    '/clients/deletion/preview',
    { preHandler: permission('clients.delete') },
    controller.preview,
  )
  app.post('/clients/deletion', { preHandler: permission('clients.delete') }, controller.confirm)
}
