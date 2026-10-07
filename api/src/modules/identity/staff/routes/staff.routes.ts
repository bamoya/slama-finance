import type { FastifyInstance, preHandlerHookHandler } from 'fastify'

import type { createStaffController } from '../controllers/staff.controller.js'

export function registerStaffRoutes(
  app: FastifyInstance,
  controller: ReturnType<typeof createStaffController>,
  requirePermission: (key: string) => preHandlerHookHandler,
) {
  app.get('/', { preHandler: requirePermission('staff.read') }, controller.list)
  app.get('/:userId', { preHandler: requirePermission('staff.read') }, controller.detail)
  app.post('/', { preHandler: requirePermission('staff.create') }, controller.create)
  app.post(
    '/:userId/temporary-password',
    { preHandler: requirePermission('staff.update') },
    controller.reissueTemporary,
  )
  app.patch('/:userId', { preHandler: requirePermission('staff.update') }, controller.update)
  app.put(
    '/:userId/roles',
    { preHandler: [requirePermission('staff.update'), requirePermission('roles.update')] },
    controller.replaceRoles,
  )
  app.post(
    '/:userId/disable',
    { preHandler: requirePermission('staff.update') },
    controller.status('disable'),
  )
  app.post(
    '/:userId/enable',
    { preHandler: requirePermission('staff.update') },
    controller.status('enable'),
  )
  app.delete(
    '/:userId',
    { preHandler: requirePermission('staff.update') },
    controller.status('archive'),
  )
}
