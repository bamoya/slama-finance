import { AppError } from '../../../../../lib/errors.js'
import type { AuthorizedOrganizationContext } from '../../../../../lib/organization-context.js'
import type { createOrganizationAuthRepository } from '../repositories/organization-auth.repository.js'
import type { OrganizationAccessRequest } from '../types/organization-access.types.js'
import type { createSessionService } from './session.service.js'

export function createOrganizationAccessService(options: {
  organizations: ReturnType<typeof createOrganizationAuthRepository>
  staff: (organizationId: string) => {
    sessions: ReturnType<typeof createSessionService>
    permissionKeys: (userId: string) => Promise<string[]>
  }
}) {
  return async (
    input: OrganizationAccessRequest,
  ): Promise<AuthorizedOrganizationContext | null> => {
    if (!input.token) return null
    if (input.identityType === 'owner') return null
    const staff = options.staff(input.organizationId)
    const user = await staff.sessions.resolve(input.token)
    if (!user) return null
    const organization = await options.organizations.find(input.organizationId)
    if (!organization) return null
    if (
      !organization.activatedAt ||
      organization.pausedAt ||
      organization.suspendedAt ||
      organization.deletionRequestedAt
    ) {
      await options.organizations.revokeSessions(input.organizationId)
      throw new AppError(
        403,
        'ORGANIZATION_SUSPENDED',
        'This organization is temporarily unavailable.',
      )
    }
    if (!(await staff.permissionKeys(user.id)).includes(input.permission)) return null
    return { organizationId: input.organizationId, actor: { type: 'staff', id: user.id } }
  }
}
