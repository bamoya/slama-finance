import type { OwnerOrganization } from '../../../../api/generated/models'
import { StatusBadge } from '../../../../components/management/status-badge'
import { organizationStatusLabels } from '../organization-status'

export function OrganizationStatus({ status }: { status: OwnerOrganization['status'] }) {
  return (
    <StatusBadge
      label={organizationStatusLabels[status]}
      tone={status === 'active' ? 'active' : status === 'setup' ? 'draft' : 'archived'}
    />
  )
}
