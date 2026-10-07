import type { FastifyInstance, preHandlerHookHandler } from 'fastify'

import type { createEstimateController } from '../controllers/estimate.controller.js'

export function registerEstimateRoutes(
  app: FastifyInstance,
  c: ReturnType<typeof createEstimateController>,
  permission: (key: string) => preHandlerHookHandler,
) {
  app.get('/estimates', { preHandler: permission('estimates.read') }, c.list)
  app.get('/estimates/:id', { preHandler: permission('estimates.read') }, c.get)
  app.post('/estimates', { preHandler: permission('estimates.create') }, c.create)
  app.patch('/estimates/:id', { preHandler: permission('estimates.update') }, c.update)
  app.delete('/estimates/:id', { preHandler: permission('estimates.delete') }, c.delete)
  app.post('/estimates/:id/issue', { preHandler: permission('estimates.update') }, c.issue)
  app.post(
    '/estimates/:id/revisions',
    { preHandler: permission('estimates.create') },
    c.createRevision,
  )
  app.post('/estimates/:id/accept', { preHandler: permission('estimates.update') }, c.accept)
  app.post('/estimates/:id/reject', { preHandler: permission('estimates.update') }, c.reject)
  app.post('/estimates/:id/cancel', { preHandler: permission('estimates.update') }, c.cancel)
  app.post('/estimates/:id/pdf', { preHandler: permission('estimates.read') }, c.pdf)
  app.get('/estimates/:id/artifacts', { preHandler: permission('estimates.read') }, c.artifacts)
}
