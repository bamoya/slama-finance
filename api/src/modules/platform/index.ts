import type { FastifyInstance } from 'fastify'

import type { OwnerAccountDelivery } from '../../integrations/contracts.js'
import type { Database } from '../../lib/db.js'
import { AppError } from '../../lib/errors.js'
import { createPasswordService } from '../../lib/password.js'
import type { OrganizationProvisioningPublicApi } from '../organization/identity/index.js'
import type { OwnerBrandingPublicApi } from '../organization/media/index.js'
import type { SettingsPublicApi } from '../organization/settings/index.js'
import { createOwnerFinancialSummaryController } from './analytics/controllers/owner-financial-summary.controller.js'
import { createOwnerFinancialSummaryRepository } from './analytics/repositories/owner-financial-summary.repository.js'
import { registerOwnerFinancialSummaryRoutes } from './analytics/routes/owner-financial-summary.routes.js'
import { createOwnerFinancialSummaryService } from './analytics/services/owner-financial-summary.service.js'
import { createOwnerAuthController } from './identity/controllers/owner-auth.controller.js'
import { createOwnerAuthRepository } from './identity/repositories/owner-auth.repository.js'
import { registerOwnerAuthRoutes } from './identity/routes/owner-auth.routes.js'
import { createOwnerAuthService } from './identity/services/owner-auth.service.js'
import { createOwnerOnboardingController } from './organizations/controllers/owner-onboarding.controller.js'
import { createOwnerOrganizationController } from './organizations/controllers/owner-organization.controller.js'
import { createOwnerOnboardingRepository } from './organizations/repositories/owner-onboarding.repository.js'
import { createOwnerOrganizationRepository } from './organizations/repositories/owner-organization.repository.js'
import { registerOwnerOrganizationRoutes } from './organizations/routes/owner-organization.routes.js'
import { createOwnerOnboardingService } from './organizations/services/owner-onboarding.service.js'
import { createOwnerOrganizationService } from './organizations/services/owner-organization.service.js'
import type { SubscriptionsPublicApi } from './subscriptions/index.js'

export function createPlatformModule(options: {
  database: () => Database
  ttlDays: number
  secure: boolean
  ownerAuth: { enabled: boolean; portalOrigin?: string; delivery?: OwnerAccountDelivery }
  ownerBranding: () => OwnerBrandingPublicApi
  settings: () => SettingsPublicApi
  subscriptions: SubscriptionsPublicApi
  provisioning: () => OrganizationProvisioningPublicApi
}) {
  const owners = createOwnerAuthService(
    createOwnerAuthRepository(options.database),
    createPasswordService(),
    { ...options.ownerAuth, ttlDays: options.ttlDays },
  )
  const organizations = createOwnerOrganizationService(
    createOwnerOrganizationRepository(options.database),
    owners,
  )
  const onboarding = createOwnerOnboardingService(
    createOwnerOnboardingRepository(options.database),
    owners,
    () => {
      if (!options.ownerBranding)
        throw new AppError(503, 'STORAGE_UNAVAILABLE', 'Brand image storage is unavailable.')
      return options.ownerBranding()
    },
    {
      subscriptions: options.subscriptions,
      settings: options.settings,
      provision: (tx, input) => options.provisioning().provision(tx, input),
    },
  )
  return {
    publicApi: { resolveOwnerSession: owners.session },
    async registerRoutes(app: FastifyInstance) {
      registerOwnerFinancialSummaryRoutes(
        app,
        createOwnerFinancialSummaryController(
          createOwnerFinancialSummaryService(
            createOwnerFinancialSummaryRepository(options.database),
            owners,
          ),
        ),
        options.ownerAuth.portalOrigin,
      )
      await app.register(
        async (scope) =>
          registerOwnerAuthRoutes(
            scope,
            createOwnerAuthController(owners, options.secure),
            options.ownerAuth.portalOrigin,
          ),
        { prefix: '/v1/owner-auth' },
      )
      await app.register(
        async (scope) =>
          registerOwnerOrganizationRoutes(
            scope,
            createOwnerOrganizationController(organizations),
            options.ownerAuth.portalOrigin,
            createOwnerOnboardingController(onboarding),
          ),
        { prefix: '/v1/owner' },
      )
    },
  }
}
