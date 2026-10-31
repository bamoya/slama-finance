import type { FastifyInstance } from 'fastify'

import type { Database } from '../../../lib/db.js'
import { createPasswordService } from '../../../lib/password.js'
import { createAdminController } from './controllers/admin.controller.js'
import { createAdminRepository } from './repositories/admin.repository.js'
import { registerAdminRoutes } from './routes/admin.routes.js'
import { createAdminAccountsService } from './services/admin-accounts.service.js'
import { createAdminAuthService } from './services/admin-auth.service.js'
import { type AdminBillingPort, createAdminPortalService } from './services/admin-portal.service.js'

export type { AdminBillingPort }

/** SaaS administration realm: separate identities, sessions, cookie and audit trail. */
export function createAdministrationModule(options: {
  database: () => Database
  billing: AdminBillingPort
  secure: boolean
  portalOrigin?: string
  totpKey?: Buffer
  clock?: () => Date
}) {
  const repo = createAdminRepository(options.database)
  const auth = createAdminAuthService(repo, createPasswordService(), {
    totpKey: options.totpKey,
    clock: options.clock,
  })
  const portal = createAdminPortalService(repo, options.billing)
  return {
    async registerRoutes(app: FastifyInstance) {
      await app.register(
        (scope) =>
          registerAdminRoutes(
            scope,
            createAdminController(auth, portal, options.secure),
            options.portalOrigin,
          ),
        { prefix: '/v1/admin' },
      )
    },
  }
}

/** Operator CLI entry point (migration-owner connection). */
export const createAdminAccounts = (database: () => Database) =>
  createAdminAccountsService(createAdminRepository(database), createPasswordService())
