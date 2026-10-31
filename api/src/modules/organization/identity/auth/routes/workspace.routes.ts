import type { FastifyInstance } from 'fastify'

import type { createWorkspaceController } from '../controllers/workspace.controller.js'
export function registerWorkspaceRoutes(
  app: FastifyInstance,
  controller: ReturnType<typeof createWorkspaceController>,
) {
  app.get('/api/v1/workspace/session', controller.session)
}
