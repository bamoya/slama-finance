import type { FastifyInstance, preHandlerHookHandler } from 'fastify'

import type { createClientController } from '../controllers/client.controller.js'

export function registerClientRoutes(
  app: FastifyInstance,
  c: ReturnType<typeof createClientController>,
  permission: (key: string) => preHandlerHookHandler,
) {
  app.get('/clients', { preHandler: permission('clients.read') }, c.list)
  app.get('/clients/:id', { preHandler: permission('clients.read') }, c.get)
  app.get('/clients/:id/overview', { preHandler: permission('clients.read') }, c.overview)
  app.post('/clients', { preHandler: permission('clients.create') }, c.create)
  app.patch('/clients/:id', { preHandler: permission('clients.update') }, c.update)
  app.delete('/clients/:id', { preHandler: permission('clients.delete') }, c.delete)
  app.post('/clients/:id/archive', { preHandler: permission('clients.update') }, c.archive)
  app.post('/clients/:id/restore', { preHandler: permission('clients.update') }, c.restore)
}
