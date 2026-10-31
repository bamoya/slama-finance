import type { FastifyInstance, preHandlerHookHandler } from 'fastify'

import type {
  OrganizationAdminDelivery,
  OrganizationInvitationDelivery,
  PasswordResetDelivery,
} from '../../../integrations/contracts.js'
import type { Database, Transaction } from '../../../lib/db.js'
import { AppError } from '../../../lib/errors.js'
import { currentOrganizationId } from '../../../lib/tenant-database.js'
import type { SubscriptionsPublicApi } from '../../platform/subscriptions/index.js'
import { createAuthController } from './auth/controllers/auth.controller.js'
import { createWorkspaceController } from './auth/controllers/workspace.controller.js'
import { toSession } from './auth/mappers/auth.mapper.js'
import { createAuthRepository } from './auth/repositories/auth.repository.js'
import { createOrganizationAuthRepository } from './auth/repositories/organization-auth.repository.js'
import { createPasswordRecoveryRepository } from './auth/repositories/password-recovery.repository.js'
import { createSessionRepository } from './auth/repositories/session.repository.js'
import { createWorkspaceRepository } from './auth/repositories/workspace.repository.js'
import { registerAuthRoutes } from './auth/routes/auth.routes.js'
import { registerOrganizationAuthRoutes } from './auth/routes/organization-auth.routes.js'
import { registerWorkspaceRoutes } from './auth/routes/workspace.routes.js'
import { createAuthService } from './auth/services/auth.service.js'
import { createOrganizationAccessService } from './auth/services/organization-access.service.js'
import { createPasswordService } from './auth/services/password.service.js'
import { createPasswordRecoveryService } from './auth/services/password-recovery.service.js'
import { createSessionService } from './auth/services/session.service.js'
import { createWorkspaceService } from './auth/services/workspace.service.js'
import type { IdentityPublicApi } from './identity.public.js'
import { createInvitationController } from './invitations/controllers/invitation.controller.js'
import { createInvitationRepository } from './invitations/repositories/invitation.repository.js'
import { registerInvitationRoutes } from './invitations/routes/invitation.routes.js'
import { createInvitationService } from './invitations/services/invitation.service.js'
import { createAdminProvisioningRepository } from './provisioning/repositories/admin-provisioning.repository.js'
import { createAdminProvisioningService } from './provisioning/services/admin-provisioning.service.js'
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
  subscriptions?: SubscriptionsPublicApi
  invitationDelivery?: OrganizationInvitationDelivery
  adminDelivery?: OrganizationAdminDelivery
  portalOrigin?: string
  ttlDays: number
  secure: boolean
  passwordReset?: { adapter: PasswordResetDelivery; resetUrl: string }
  onAuthorizationChange?: (tx: Transaction, userIds: string[]) => Promise<void>
}) {
  const organizationRepository = createOrganizationAuthRepository(options.database)
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
    options.subscriptions,
  )
  const invitations = createInvitationService(
    createInvitationRepository(options.database),
    createStaffRepository(options.database),
    {
      subscriptions: options.subscriptions,
      delivery: options.invitationDelivery,
      origin: options.portalOrigin,
    },
  )
  const adminProvisioning = createAdminProvisioningService(
    createAdminProvisioningRepository(options.database),
    options.adminDelivery,
    options.portalOrigin,
  )
  const authorizeOrganization = createOrganizationAccessService({
    organizations: organizationRepository,
    staff: (organizationId) => {
      const scopedUsers = createAuthRepository(options.database, organizationId)
      const scopedSessions = createSessionService(
        createSessionRepository(options.database, organizationId),
        scopedUsers,
        options.ttlDays,
      )
      const scopedRbac = createRbacService(
        options.database,
        createRbacRepository(options.database, organizationId),
        scopedSessions,
      )
      return { sessions: scopedSessions, permissionKeys: scopedRbac.permissionKeys }
    },
  })
  const publicApi: IdentityPublicApi = {
    authorizeOrganization,
    async resolveSession(token, identityType = 'staff') {
      if (identityType === 'owner') return null
      const organizationId = currentOrganizationId()
      if (!organizationId) return null
      const organization = await organizationRepository.find(organizationId)
      if (!organization) return null
      if (
        !organization.activatedAt ||
        organization.pausedAt ||
        organization.suspendedAt ||
        organization.deletionRequestedAt
      ) {
        await organizationRepository.revokeSessions(organizationId)
        throw new AppError(
          403,
          'ORGANIZATION_SUSPENDED',
          'This organization is temporarily unavailable.',
        )
      }
      const user = await sessions.resolve(token)
      return user ? toSession(user).user : null
    },
    async authorize(token, permission, identityType = 'staff') {
      const organizationId = currentOrganizationId()
      if (!organizationId) return null
      const context = await authorizeOrganization({
        organizationId,
        identityType,
        token,
        permission,
      })
      return context ? { userId: context.actor.id } : null
    },
    grants: rbac.grants,
    reportingRecipient: rbac.reportingRecipient,
    reportingRecipients: rbac.reportingRecipients,
  }
  return {
    publicApi,
    invitations,
    provisioning: { ...adminProvisioning, invite: invitations.provision },
    async registerRoutes(
      app: FastifyInstance,
      requirePermission: (key: string) => preHandlerHookHandler,
    ) {
      registerInvitationRoutes(app, createInvitationController(invitations), requirePermission)
      if (options.subscriptions)
        registerWorkspaceRoutes(
          app,
          createWorkspaceController(
            createWorkspaceService(
              publicApi,
              options.database,
              createWorkspaceRepository(options.database),
              options.subscriptions,
            ),
          ),
        )
      await app.register(
        async (scope) => {
          registerOrganizationAuthRoutes(scope, async (organizationId) => {
            const organization = await organizationRepository.find(organizationId)
            if (!organization)
              throw new AppError(404, 'ORGANIZATION_NOT_FOUND', 'Organization not found.')
            if (
              !organization.activatedAt ||
              organization.pausedAt ||
              organization.suspendedAt ||
              organization.deletionRequestedAt
            ) {
              await organizationRepository.revokeSessions(organizationId)
              throw new AppError(
                403,
                'ORGANIZATION_SUSPENDED',
                'This organization is temporarily unavailable.',
              )
            }
            const scopedUsers = createAuthRepository(options.database, organizationId)
            const scopedSessions = createSessionService(
              createSessionRepository(options.database, organizationId),
              scopedUsers,
              options.ttlDays,
            )
            const scopedAuth = createAuthService(scopedUsers, passwords, scopedSessions)
            const scopedRbac = createRbacService(
              options.database,
              createRbacRepository(options.database, organizationId),
              scopedSessions,
            )
            const delivery = options.passwordReset
              ? {
                  ...options.passwordReset,
                  resetUrl: new URL(
                    `/organizations/${organizationId}/reset-password`,
                    options.passwordReset.resetUrl,
                  ).toString(),
                }
              : undefined
            const scopedRecovery = createPasswordRecoveryService(
              createPasswordRecoveryRepository(
                options.database,
                organizationId,
                organization.locale,
              ),
              passwords,
              delivery,
            )
            return createAuthController(
              scopedAuth,
              scopedRecovery,
              {
                ...options,
                checkAccess: options.subscriptions
                  ? () =>
                      options
                        .database()
                        .transaction((tx) => options.subscriptions!.assertAccess(tx))
                  : undefined,
                cookieName: 'slama_staff_session',
                cookiePath: '/api/v1',
              },
              scopedRbac.permissionKeys,
            )
          })
        },
        { prefix: '/api/v1/organization-auth' },
      )
      await app.register(
        async (scope) => {
          registerAuthRoutes(
            scope,
            createAuthController(
              auth,
              recovery,
              {
                ...options,
                checkAccess: options.subscriptions
                  ? () =>
                      options
                        .database()
                        .transaction((tx) => options.subscriptions!.assertAccess(tx))
                  : undefined,
              },
              rbac.permissionKeys,
            ),
          )
        },
        { prefix: '/api/v1/auth' },
      )
      await app.register(
        async (scope) => {
          registerRbacRoutes(scope, createRbacController(rbac), requirePermission)
        },
        { prefix: '/api/v1/rbac' },
      )
      await app.register(
        async (scope) => {
          registerStaffRoutes(scope, createStaffController(staff), requirePermission)
        },
        { prefix: '/api/v1/staff' },
      )
    },
  }
}

export type OrganizationProvisioningPublicApi = Pick<
  ReturnType<typeof createAdminProvisioningService>,
  'provision'
> & { invite: ReturnType<typeof createInvitationService>['provision'] }
