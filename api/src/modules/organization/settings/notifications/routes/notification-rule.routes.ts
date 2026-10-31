import type { FastifyInstance, preHandlerHookHandler } from 'fastify'

import type { createNotificationRuleController } from '../controllers/notification-rule.controller.js'

export function registerNotificationRuleRoutes(
  app: FastifyInstance,
  c: ReturnType<typeof createNotificationRuleController>,
  permission: (key: string) => preHandlerHookHandler,
) {
  app.get('/notification-rules', { preHandler: permission('notification_rules.read') }, c.list)
  app.post(
    '/notification-rules/:id/preview',
    {
      preHandler: permission('notification_rules.update'),
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    },
    c.preview,
  )
  app.patch(
    '/notification-rules/:id',
    { preHandler: permission('notification_rules.update') },
    c.update,
  )
  app.post(
    '/notification-rules/:id/test',
    {
      preHandler: permission('notification_rules.update'),
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    c.test,
  )
}
