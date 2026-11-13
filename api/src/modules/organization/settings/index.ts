import type { FastifyInstance, preHandlerHookHandler } from 'fastify'

import type { Database } from '../../../lib/db.js'
import type { Transaction } from '../../../lib/db.js'
import { shownIdentity } from '../../../lib/documents/shown-identity.js'
import type { NotificationPublicApi } from '../../../support/notifications/index.js'
import type { MediaPublicApi } from '../media/index.js'
import type { SalesSettingsDeletionApi } from '../sales/index.js'
import { createSettingsController } from './controllers/settings.controller.js'
import { createSettingsDeletionController } from './controllers/settings-deletion.controller.js'
import { createNotificationRuleController } from './notifications/controllers/notification-rule.controller.js'
import { createNotificationRuleRepository } from './notifications/repositories/notification-rule.repository.js'
import { registerNotificationRuleRoutes } from './notifications/routes/notification-rule.routes.js'
import { createNotificationRuleService } from './notifications/services/notification-rule.service.js'
import { createSettingsRepository } from './repositories/settings.repository.js'
import { registerSettingsRoutes } from './routes/settings.routes.js'
import { registerSettingsDeletionRoutes } from './routes/settings-deletion.routes.js'
import { applyOrganizationSetup } from './services/organization-setup.service.js'
import { createPreviewService } from './services/preview.service.js'
import { createSettingsService } from './services/settings.service.js'
import { createSettingsDeletionService } from './services/settings-deletion.service.js'

export function createSettingsModule(
  database: () => Database,
  media: MediaPublicApi,
  sales: SalesSettingsDeletionApi,
) {
  const service = createSettingsService(createSettingsRepository(database), media)
  const deletion = createSettingsDeletionService(createSettingsRepository(database), sales, media)
  return {
    publicApi: {
      applyOrganizationSetup,
      getCompany: service.getCompany,
      legalRequirements: service.legalRequirements,
      getBank: service.getBank,
      getTemplate: service.getTemplate,
    },
    async registerRoutes(app: FastifyInstance, permission: (key: string) => preHandlerHookHandler) {
      await app.register(
        async (scope) => {
          registerSettingsDeletionRoutes(
            scope,
            createSettingsDeletionController(deletion),
            permission,
          )
          registerSettingsRoutes(
            scope,
            createSettingsController(
              service,
              createPreviewService(media, async () => {
                const company = await service.getCompany()
                const bank = company.defaultBankAccountId
                  ? await service.getBank(company.defaultBankAccountId).catch(() => null)
                  : null
                const shown = (await service.legalRequirements()).items.find(
                  (item) => item.legalType === company.legalType,
                )
                return {
                  company: shownIdentity(
                    company,
                    (shown?.fields ?? []).map((f) => f.field),
                  ),
                  bank,
                  locale: company.locale,
                  logoAssetId: company.logoAssetId,
                }
              }),
            ),
            permission,
          )
        },
        { prefix: '/api/v1' },
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
        { prefix: '/api/v1' },
      ),
  }
}

export type SettingsPublicApi = ReturnType<typeof createSettingsModule>['publicApi']
