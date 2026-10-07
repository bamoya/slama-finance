import type { FastifyInstance, preHandlerHookHandler } from 'fastify'

import type { createRbacController } from '../controllers/rbac.controller.js'

export function registerRbacRoutes(
  app: FastifyInstance,
  controller: ReturnType<typeof createRbacController>,
  requirePermission: (key: string) => preHandlerHookHandler,
) {
  app.get(
    '/permissions',
    { preHandler: requirePermission('roles.read') },
    controller.listPermissions,
  )
  app.get('/roles', { preHandler: requirePermission('roles.read') }, controller.listRoles)
  app.post('/roles', { preHandler: requirePermission('roles.create') }, controller.createRole)
  app.delete(
    '/roles/:roleId',
    { preHandler: requirePermission('roles.delete') },
    controller.deleteRole,
  )
  app.put(
    '/roles/:roleId/permissions',
    { preHandler: requirePermission('roles.update') },
    controller.replacePermissions,
  )
}
