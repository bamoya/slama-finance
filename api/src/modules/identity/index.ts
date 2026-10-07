import type { FastifyInstance, preHandlerHookHandler } from 'fastify'

import type { PasswordResetDelivery } from '../../integrations/contracts.js'
import type { Database, Transaction } from '../../lib/db.js'
import { createAuthController } from './auth/controllers/auth.controller.js'
import { toSession } from './auth/mappers/auth.mapper.js'
import { createAuthRepository } from './auth/repositories/auth.repository.js'
import { createPasswordRecoveryRepository } from './auth/repositories/password-recovery.repository.js'
import { createSessionRepository } from './auth/repositories/session.repository.js'
import { registerAuthRoutes } from './auth/routes/auth.routes.js'
import { createAuthService } from './auth/services/auth.service.js'
import { createPasswordService } from './auth/services/password.service.js'
import { createPasswordRecoveryService } from './auth/services/password-recovery.service.js'
import { createSessionService } from './auth/services/session.service.js'
import type { IdentityPublicApi } from './identity.public.js'
import { createRbacController } from './rbac/controllers/rbac.controller.js'
import { createRbacRepository } from './rbac/repositories/rbac.repository.js'
import { registerRbacRoutes } from './rbac/routes/rbac.routes.js'
import { createRbacService } from './rbac/services/rbac.service.js'
import { createStaffController } from './staff/controllers/staff.controller.js'
import { createStaffRepository } from './staff/repositories/staff.repository.js'
import { registerStaffRoutes } from './staff/routes/staff.routes.js'
import { createStaffService } from './staff/services/staff.service.js'

export function createIdentityModule(options: {
  database: () => Database
  ttlDays: number
  secure: boolean
  passwordReset?: { adapter: PasswordResetDelivery; resetUrl: string }
  onAuthorizationChange?: (tx: Transaction, userIds: string[]) => Promise<void>
}) {
  const users = createAuthRepository(options.database)
  const passwords = createPasswordService()
  const recovery = createPasswordRecoveryService(
    createPasswordRecoveryRepository(options.database),
    passwords,
    options.passwordReset,
  )
  const sessions = createSessionService(
    createSessionRepository(options.database),
    users,
    options.ttlDays,
  )
  const auth = createAuthService(users, passwords, sessions)
  const rbac = createRbacService(
    options.database,
    createRbacRepository(options.database),
    sessions,
    options.onAuthorizationChange,
  )
  const staff = createStaffService(
    options.database,
    createStaffRepository(options.database),
    passwords,
    options.onAuthorizationChange,
  )
  const publicApi: IdentityPublicApi = {
    async resolveSession(token) {
      const user = await sessions.resolve(token)
      return user ? toSession(user).user : null
    },
    authorize: rbac.authorize,
    grants: rbac.grants,
    reportingRecipient: rbac.reportingRecipient,
    reportingRecipients: rbac.reportingRecipients,
  }
  return {
    publicApi,
    async registerRoutes(
      app: FastifyInstance,
      requirePermission: (key: string) => preHandlerHookHandler,
    ) {
      await app.register(
        async (scope) => {
          registerAuthRoutes(
            scope,
            createAuthController(auth, recovery, options, rbac.permissionKeys),
          )
        },
        { prefix: '/v1/auth' },
      )
      await app.register(
        async (scope) => {
          registerRbacRoutes(scope, createRbacController(rbac), requirePermission)
        },
        { prefix: '/v1/rbac' },
      )
      await app.register(
        async (scope) => {
          registerStaffRoutes(scope, createStaffController(staff), requirePermission)
        },
        { prefix: '/v1/staff' },
      )
    },
  }
}
