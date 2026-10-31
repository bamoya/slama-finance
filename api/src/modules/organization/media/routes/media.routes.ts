import type { FastifyInstance, preHandlerHookHandler } from 'fastify'

import type { createMediaController } from '../controllers/media.controller.js'

export function registerMediaRoutes(
  app: FastifyInstance,
  controller: ReturnType<typeof createMediaController>,
  authenticate: preHandlerHookHandler,
) {
  app.addHook('preHandler', authenticate)
  app.post(
    '/uploads',
    { bodyLimit: 3 * 1024 * 1024, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    controller.upload,
  )
  app.get('/:id', controller.get)
  app.get('/:id/download', controller.download)
  app.delete('/:id', controller.remove)
}
