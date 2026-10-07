import type { FastifyInstance, preHandlerHookHandler } from 'fastify'

import type { Database } from '../../lib/db.js'
import type { Transaction } from '../../lib/db.js'
import type { NotificationPublicApi } from '../../support/notifications/index.js'
import type { MediaPublicApi } from '../media/index.js'
import { createSettingsController } from './controllers/settings.controller.js'
import { createNotificationRuleController } from './notifications/controllers/notification-rule.controller.js'
import { createNotificationRuleRepository } from './notifications/repositories/notification-rule.repository.js'
import { registerNotificationRuleRoutes } from './notifications/routes/notification-rule.routes.js'
import { createNotificationRuleService } from './notifications/services/notification-rule.service.js'
import { createSettingsRepository } from './repositories/settings.repository.js'
import { registerSettingsRoutes } from './routes/settings.routes.js'
import { createPreviewService } from './services/preview.service.js'
import { createSettingsService } from './services/settings.service.js'

export function createSettingsModule(database: () => Database, media: MediaPublicApi) {
  const service = createSettingsService(createSettingsRepository(database), media)
  return {
    publicApi: {
      getCompany: service.getCompany,
      getBank: service.getBank,
      getTemplate: service.getTemplate,
    },
    async registerRoutes(app: FastifyInstance, permission: (key: string) => preHandlerHookHandler) {
      await app.register(
        async (scope) =>
          registerSettingsRoutes(
            scope,
            createSettingsController(service, createPreviewService(media)),
            permission,
          ),
        { prefix: '/v1' },
      )
    },
  }
}

export type { NotificationPolicyPublicApi } from './notifications/notifications.public.js'
export function createNotificationSettingsModule(
  database: () => Database,
  notifications: NotificationPublicApi,
  options: {
    allowedFrom: string[]
    onPolicyChange?: (tx: Transaction, event: string) => Promise<void>
  },
) {
  const service = createNotificationRuleService(
    createNotificationRuleRepository(database),
    notifications,
    options,
  )
  return {
    publicApi: service.publicApi,
    registerRoutes: async (
      app: FastifyInstance,
      permission: (key: string) => preHandlerHookHandler,
    ) =>
      app.register(
        async (scope) =>
          registerNotificationRuleRoutes(
            scope,
            createNotificationRuleController(service),
            permission,
          ),
        { prefix: '/v1' },
      ),
  }
}
