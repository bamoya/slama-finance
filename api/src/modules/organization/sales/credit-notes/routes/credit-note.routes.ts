import type { FastifyInstance, preHandlerHookHandler } from 'fastify'

import type { createCreditNoteController } from '../controllers/credit-note.controller.js'

export function registerCreditNoteRoutes(
  app: FastifyInstance,
  c: ReturnType<typeof createCreditNoteController>,
  permission: (key: string) => preHandlerHookHandler,
) {
  app.get('/credit-notes', { preHandler: permission('credit_notes.read') }, c.list)
  app.get('/credit-notes/:id', { preHandler: permission('credit_notes.read') }, c.get)
  app.post('/credit-notes', { preHandler: permission('credit_notes.create') }, c.create)
  app.patch('/credit-notes/:id', { preHandler: permission('credit_notes.update') }, c.update)
  app.delete('/credit-notes/:id', { preHandler: permission('credit_notes.delete') }, c.delete)
  app.post('/credit-notes/:id/issue', { preHandler: permission('credit_notes.update') }, c.issue)
  app.post('/credit-notes/:id/pdf', { preHandler: permission('credit_notes.update') }, c.pdf)
  app.get(
    '/credit-notes/:id/artifacts',
    { preHandler: permission('credit_notes.read') },
    c.artifacts,
  )
  app.get(
    '/invoices/:id/credit-notes',
    { preHandler: permission('credit_notes.read') },
    c.forInvoice,
  )
  app.get(
    '/invoices/:id/creditable-lines',
    { preHandler: permission('credit_notes.create') },
    c.creditableLines,
  )
}
