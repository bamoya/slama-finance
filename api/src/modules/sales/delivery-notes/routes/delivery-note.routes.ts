import type { FastifyInstance, preHandlerHookHandler } from 'fastify'

import type { createDeliveryNoteController } from '../controllers/delivery-note.controller.js'

export function registerDeliveryNoteRoutes(
  app: FastifyInstance,
  c: ReturnType<typeof createDeliveryNoteController>,
  permission: (key: string) => preHandlerHookHandler,
) {
  app.get('/delivery-notes', { preHandler: permission('delivery_notes.read') }, c.list)
  app.get('/delivery-notes/:id', { preHandler: permission('delivery_notes.read') }, c.get)
  app.post('/delivery-notes', { preHandler: permission('delivery_notes.create') }, c.create)
  app.patch('/delivery-notes/:id', { preHandler: permission('delivery_notes.update') }, c.update)
  app.delete('/delivery-notes/:id', { preHandler: permission('delivery_notes.delete') }, c.delete)
  app.post(
    '/delivery-notes/:id/prepare',
    { preHandler: permission('delivery_notes.update') },
    c.prepare,
  )
  app.post(
    '/delivery-notes/:id/deliver',
    { preHandler: permission('delivery_notes.update') },
    c.deliver,
  )
  app.post(
    '/delivery-notes/:id/acknowledge',
    { preHandler: permission('delivery_notes.update') },
    c.acknowledge,
  )
  app.post(
    '/delivery-notes/:id/cancel',
    { preHandler: permission('delivery_notes.update') },
    c.cancel,
  )
  app.post('/delivery-notes/:id/pdf', { preHandler: permission('delivery_notes.read') }, c.pdf)
  app.get(
    '/delivery-notes/:id/artifacts',
    { preHandler: permission('delivery_notes.read') },
    c.artifacts,
  )
}
