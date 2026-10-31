import type { OwnerOrganization } from '../contracts/generated/identity/owner-organizations.schemas.js'
/** Internal lifecycle markers; transport representations are generated from OpenAPI. */
export interface OrganizationLifecycleMarkers {
  activatedAt: Date | null
  pausedAt: Date | null
  suspendedAt: Date | null
  deletionRequestedAt: Date | null
}

export function organizationState(
  value: OrganizationLifecycleMarkers,
): OwnerOrganization['status'] {
  if (value.deletionRequestedAt) return 'pending_deletion'
  if (value.suspendedAt) return 'suspended'
  if (value.pausedAt) return 'paused'
  return value.activatedAt ? 'active' : 'setup'
}
export function toOwnerOrganization(value: {
  organization: OrganizationLifecycleMarkers & {
    id: string
    name: string
    slug: string
    locale: 'fr' | 'en'
    createdAt: Date
  }
  staffCount: number
}): OwnerOrganization {
  const { organization, staffCount } = value
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    locale: organization.locale,
    status: organizationState(organization),
    createdAt: organization.createdAt.toISOString(),
    staffCount,
  }
}
