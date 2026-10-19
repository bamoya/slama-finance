import type { FastifyInstance, preHandlerHookHandler } from 'fastify'

import type { createDeletionController } from '../controllers/deletion.controller.js'

export function registerDeletionRoutes(
  app: FastifyInstance,
  controller: ReturnType<typeof createDeletionController>,
  authenticate: preHandlerHookHandler,
) {
  // Service authorizes the dynamic resource and every descendant/detachment
  // under the same transaction lock after full-session authentication.
  app.post('/sales/deletion/preview', { preHandler: authenticate }, controller.preview)
  app.post('/sales/deletion', { preHandler: authenticate }, controller.confirm)
}
