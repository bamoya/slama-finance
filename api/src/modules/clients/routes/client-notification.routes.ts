import type { FastifyInstance, preHandlerHookHandler } from 'fastify'

import type { createClientNotificationController } from '../controllers/client-notification.controller.js'

export function registerClientNotificationRoutes(
  app: FastifyInstance,
  c: ReturnType<typeof createClientNotificationController>,
  permission: (key: string) => preHandlerHookHandler,
) {
  app.get(
    '/clients/:id/notification-preferences',
    {
      preHandler: [permission('clients.read'), permission('client_notification_preferences.read')],
    },
    c.list,
  )
  app.put(
    '/clients/:id/notification-preferences/:ruleId',
    {
      preHandler: [
        permission('clients.read'),
        permission('client_notification_preferences.update'),
      ],
    },
    c.upsert,
  )
  app.delete(
    '/clients/:id/notification-preferences/:ruleId',
    {
      preHandler: [
        permission('clients.read'),
        permission('client_notification_preferences.update'),
      ],
    },
    c.remove,
  )
}
