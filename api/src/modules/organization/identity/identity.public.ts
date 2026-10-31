import type { User } from '../../../contracts/generated/identity/auth.schemas.js'
import type { Transaction } from '../../../lib/db.js'
import type { AuthorizedOrganizationContext } from '../../../lib/organization-context.js'
import type { OrganizationAccessRequest } from './auth/types/organization-access.types.js'
export interface ReportingRecipient {
  id: string
  name: string
  email: string
  eligible: boolean
  reasons: string[]
}
export type { OrganizationAccessRequest }
export interface IdentityPublicApi {
  /** Identity/RBAC only; callers must additionally enforce subscription entitlements and quotas. */
  authorizeOrganization(
    input: OrganizationAccessRequest,
  ): Promise<AuthorizedOrganizationContext | null>
  resolveSession(token?: string, identityType?: 'owner' | 'staff'): Promise<User | null>
  authorize(
    token: string | undefined,
    permission: string,
    identityType?: 'owner' | 'staff',
  ): Promise<{ userId: string } | null>
  grants(userId: string, tx?: Transaction): Promise<string[]>
  reportingRecipient(
    userId: string,
    sections: string[],
    tx?: Transaction,
  ): Promise<ReportingRecipient | null>
  reportingRecipients(
    input: { sections: string[]; search?: string; limit: number; offset: number },
    tx?: Transaction,
  ): Promise<{ items: ReportingRecipient[]; total: number; limit: number; offset: number }>
}
