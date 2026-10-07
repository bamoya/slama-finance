import type { FastifyInstance, preHandlerHookHandler } from 'fastify'

import type { createArtifactController } from '../controllers/artifact.controller.js'

export function registerArtifactRoutes(
  app: FastifyInstance,
  controller: ReturnType<typeof createArtifactController>,
  authenticate: preHandlerHookHandler,
) {
  app.get('/artifacts/:id/download', { preHandler: authenticate }, controller.download)
  app.post(
    '/documents/:documentType/:id/regenerate-pdf',
    { preHandler: authenticate, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    controller.regenerate,
  )
}
