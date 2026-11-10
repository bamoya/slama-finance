import type { Database } from '../../../../../lib/db.js'
import { AppError } from '../../../../../lib/errors.js'
import { toOwnerOrganization } from '../../../../../lib/organization-view.js'
import type { SubscriptionsPublicApi } from '../../../../platform/subscriptions/index.js'
import type { createWorkspaceRepository } from '../repositories/workspace.repository.js'
import type { WorkspaceIdentity } from '../types/workspace.types.js'
export function createWorkspaceService(
  identity: WorkspaceIdentity,
  database: () => Database,
  repo: ReturnType<typeof createWorkspaceRepository>,
  subscriptions: SubscriptionsPublicApi,
) {
  return {
    async session(id: string, type: 'staff', token?: string) {
      const user = await identity.resolveSession(token, type)
      if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to this organization.')
      const { organization, defaultVatRate, staffCount } = await repo.read(id)
      if (!organization)
        throw new AppError(404, 'ORGANIZATION_NOT_FOUND', 'Organization not found.')
      const subscription = await database().transaction((tx) => subscriptions.assertAccess(tx))
      return {
        defaultVatRate,
        organization: toOwnerOrganization({ organization, staffCount }),
        identityType: type,
        session: { user, purpose: 'full', permissionKeys: await identity.grants(user.id) },
        subscription: {
          entitlements: subscription.entitlements,
          accessValidUntil: subscription.accessValidUntil,
        },
      }
    },
  }
}
