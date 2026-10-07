import type { FastifyInstance, preHandlerHookHandler } from 'fastify'

import type { Database } from '../../lib/db.js'
import type { Transaction } from '../../lib/db.js'
import type { NotificationPolicyPublicApi } from '../settings/index.js'
import { createClientController } from './controllers/client.controller.js'
import { createClientNotificationController } from './controllers/client-notification.controller.js'
import { createClientRepository } from './repositories/client.repository.js'
import { createClientNotificationRepository } from './repositories/client-notification.repository.js'
import { registerClientRoutes } from './routes/client.routes.js'
import { registerClientNotificationRoutes } from './routes/client-notification.routes.js'
import { createClientService } from './services/client.service.js'
import { createClientNotificationService } from './services/client-notification.service.js'

export function createClientModule(
  database: () => Database,
  onNotificationChange?: (tx: Transaction, id: string) => Promise<void>,
) {
  const service = createClientService(createClientRepository(database), onNotificationChange)
  return {
    publicApi: { getClient: service.get },
    async registerRoutes(app: FastifyInstance, permission: (key: string) => preHandlerHookHandler) {
      await app.register(
        async (scope) => registerClientRoutes(scope, createClientController(service), permission),
        { prefix: '/v1' },
      )
    },
  }
}

export type {
  ClientNotificationsPublicApi,
  EffectiveClientNotification,
} from './client-notifications.public.js'
export function createClientNotificationModule(
  database: () => Database,
  policies: NotificationPolicyPublicApi,
  onChange?: (tx: Transaction, id: string) => Promise<void>,
) {
  const service = createClientNotificationService(
    createClientNotificationRepository(database),
    policies,
    onChange,
  )
  return {
    publicApi: service.publicApi,
    registerRoutes: async (
      app: FastifyInstance,
      permission: (key: string) => preHandlerHookHandler,
    ) =>
      app.register(
        async (scope) =>
          registerClientNotificationRoutes(
            scope,
            createClientNotificationController(service),
            permission,
          ),
        { prefix: '/v1' },
      ),
  }
}
