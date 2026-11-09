import type { FastifyInstance } from 'fastify'

import type { OwnerAccountDelivery } from '../../../integrations/contracts.js'
import type { Database } from '../../../lib/db.js'
import { createPasswordService } from '../../../lib/password.js'
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
import { createCustomerLifecycleController } from './lifecycle/controllers/customer-lifecycle.controller.js'
import { createCustomerLifecycleRepository } from './lifecycle/repositories/customer-lifecycle.repository.js'
import { registerCustomerLifecycleRoutes } from './lifecycle/routes/customer-lifecycle.routes.js'
import { createCustomerLifecycleService } from './lifecycle/services/customer-lifecycle.service.js'
import { createOverrideController } from './overrides/controllers/override.controller.js'
import { createOverrideRepository } from './overrides/repositories/override.repository.js'
import { registerOverrideRoutes } from './overrides/routes/override.routes.js'
import { createOverrideService } from './overrides/services/override.service.js'
import { createAdminOverviewController } from './overview/controllers/admin-overview.controller.js'
import { createAdminOverviewRepository } from './overview/repositories/admin-overview.repository.js'
import { registerAdminOverviewRoutes } from './overview/routes/admin-overview.routes.js'
import { createAdminOverviewService } from './overview/services/admin-overview.service.js'
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
  /** Owner account emails (customer invitations); links point at portalOrigin. */
  ownerDelivery?: OwnerAccountDelivery
  /** Subscription timezone-data guard: blocks override writes on a mismatch. */
  timezoneWritable?: () => void
}) {
  const { withAdmin, accounts, audit } = createAdministrationServices(options.database)
  const authService = createAdminAuthService(accounts, audit, withAdmin, createPasswordService(), {
    totpKey: options.totpKey,
    clock: options.clock,
  })
  const auth = createAdminAuthController(authService, options.secure)
  const payments = createAdminPaymentRepository()
  const paymentsController = createAdminPaymentsController(
    createAdminPaymentsService(payments, audit, withAdmin, options.billing, authService.stepUp),
    auth.currentAdmin,
  )
  const customers = createAdminCustomersService(
    createAdminCustomerRepository(options.billing.lifecycleStatus),
    payments,
    audit,
    withAdmin,
    options.billing,
    options.clock,
  )
  const customersController = createAdminCustomersController(customers)
  const lifecycleController = createCustomerLifecycleController(
    createCustomerLifecycleService({
      repo: createCustomerLifecycleRepository(),
      audit,
      withAdmin,
      billing: options.billing.lifecycle,
      stepUp: authService.stepUp,
      detail: customers.detail,
      delivery: options.ownerDelivery,
      portalOrigin: options.portalOrigin,
      clock: options.clock,
    }),
    auth.currentAdmin,
  )
  const billingController = createBillingSettingsController(
    createBillingSettingsService(createBillingSettingsRepository(), audit, withAdmin),
    auth.currentAdmin,
  )
  const overrideController = createOverrideController(
    createOverrideService({
      repo: createOverrideRepository(),
      audit,
      withAdmin,
      stepUp: authService.stepUp,
      writable: options.timezoneWritable,
    }),
    auth.currentAdmin,
  )
  const auditController = createAdminAuditController(audit)
  const overviewController = createAdminOverviewController(
    createAdminOverviewService(
      createAdminOverviewRepository(options.billing.lifecycleStatus),
      withAdmin,
      options.clock,
    ),
  )

  /** Mounted at /api/v1/admin; the host guard serves it only on the admin. site. */
  async function registerAdminRoutes(app: FastifyInstance) {
    registerAdminSignInRoutes(app, auth)
    await app.register(async (scope) => {
      scope.addHook('preHandler', auth.requireAdmin)
      registerAdminSessionRoutes(scope, auth)
      registerAdminOverviewRoutes(scope, overviewController)
      registerAdminPaymentsRoutes(scope, paymentsController)
      registerAdminCustomersRoutes(scope, customersController)
      registerCustomerLifecycleRoutes(scope, lifecycleController)
      registerBillingSettingsRoutes(scope, billingController)
      registerOverrideRoutes(scope, overrideController)
      registerAdminAuditRoutes(scope, auditController)
    })
  }

  return {
    async registerRoutes(app: FastifyInstance) {
      await app.register(registerAdminRoutes, { prefix: '/api/v1/admin' })
    },
  }
}

/** Operator CLI entry point (migration-owner connection). */
export function createAdminAccounts(database: () => Database) {
  const { withAdmin, accounts, audit } = createAdministrationServices(database)
  return createAdminAccountsService(accounts, audit, withAdmin, createPasswordService())
}
