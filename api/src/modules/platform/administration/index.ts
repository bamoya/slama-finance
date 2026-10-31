import type { FastifyInstance } from 'fastify'

import type { Database } from '../../../lib/db.js'
import { createPasswordService } from '../../../lib/password.js'
import { createRequirePortalOrigin } from '../../../middlewares/require-portal-origin.js'
import { createAdminAccountsService } from './accounts/services/admin-accounts.service.js'
import { createAdminAuditController } from './audit/controllers/admin-audit.controller.js'
import { createAuditRepository } from './audit/repositories/audit.repository.js'
import { registerAdminAuditRoutes } from './audit/routes/admin-audit.routes.js'
import { createAdminAuditService } from './audit/services/admin-audit.service.js'
import { createAdminAuthController } from './auth/controllers/admin-auth.controller.js'
import { createAdminAccountRepository } from './auth/repositories/admin-account.repository.js'
import {
  registerAdminSessionRoutes,
  registerAdminSignInRoutes,
} from './auth/routes/admin-auth.routes.js'
import { createAdminAuthService } from './auth/services/admin-auth.service.js'
import { createBillingSettingsController } from './billing/controllers/billing-settings.controller.js'
import { createBillingSettingsRepository } from './billing/repositories/billing-settings.repository.js'
import { registerBillingSettingsRoutes } from './billing/routes/billing-settings.routes.js'
import { createBillingSettingsService } from './billing/services/billing-settings.service.js'
import { createAdminCustomersController } from './customers/controllers/admin-customers.controller.js'
import { createAdminCustomerRepository } from './customers/repositories/admin-customer.repository.js'
import { registerAdminCustomersRoutes } from './customers/routes/admin-customers.routes.js'
import { createAdminCustomersService } from './customers/services/admin-customers.service.js'
import { createAdminPaymentsController } from './payments/controllers/admin-payments.controller.js'
import { createAdminPaymentRepository } from './payments/repositories/admin-payment.repository.js'
import { registerAdminPaymentsRoutes } from './payments/routes/admin-payments.routes.js'
import type { AdminBillingPort } from './payments/services/admin-billing.port.js'
import { createAdminPaymentsService } from './payments/services/admin-payments.service.js'
import { createAdminTransaction } from './shared/repositories/admin-transaction.repository.js'

export type { AdminBillingPort }

function createAdministrationServices(database: () => Database) {
  const withAdmin = createAdminTransaction(database)
  const accounts = createAdminAccountRepository()
  const audit = createAdminAuditService(createAuditRepository(), withAdmin)
  return { withAdmin, accounts, audit }
}

/** SaaS administration realm: separate identities, sessions, cookie and audit trail. */
export function createAdministrationModule(options: {
  database: () => Database
  billing: AdminBillingPort
  secure: boolean
  portalOrigin?: string
  totpKey?: Buffer
  clock?: () => Date
}) {
  const { withAdmin, accounts, audit } = createAdministrationServices(options.database)
  const auth = createAdminAuthController(
    createAdminAuthService(accounts, audit, withAdmin, createPasswordService(), {
      totpKey: options.totpKey,
      clock: options.clock,
    }),
    options.secure,
  )
  const payments = createAdminPaymentRepository()
  const paymentsController = createAdminPaymentsController(
    createAdminPaymentsService(payments, audit, withAdmin, options.billing),
    auth.currentAdmin,
  )
  const customersController = createAdminCustomersController(
    createAdminCustomersService(
      createAdminCustomerRepository(),
      payments,
      withAdmin,
      options.billing,
    ),
  )
  const billingController = createBillingSettingsController(
    createBillingSettingsService(createBillingSettingsRepository(), audit, withAdmin),
    auth.currentAdmin,
  )
  const auditController = createAdminAuditController(audit)

  /** Mounted at /v1/admin. The portal is served by the owner portal origin under /admin. */
  async function registerAdminRoutes(app: FastifyInstance) {
    app.addHook('onRequest', createRequirePortalOrigin(options.portalOrigin))
    registerAdminSignInRoutes(app, auth)
    await app.register(async (scope) => {
      scope.addHook('preHandler', auth.requireAdmin)
      registerAdminSessionRoutes(scope, auth)
      registerAdminPaymentsRoutes(scope, paymentsController)
      registerAdminCustomersRoutes(scope, customersController)
      registerBillingSettingsRoutes(scope, billingController)
      registerAdminAuditRoutes(scope, auditController)
    })
  }

  return {
    async registerRoutes(app: FastifyInstance) {
      await app.register(registerAdminRoutes, { prefix: '/v1/admin' })
    },
  }
}

/** Operator CLI entry point (migration-owner connection). */
export function createAdminAccounts(database: () => Database) {
  const { withAdmin, accounts, audit } = createAdministrationServices(database)
  return createAdminAccountsService(accounts, audit, withAdmin, createPasswordService())
}
