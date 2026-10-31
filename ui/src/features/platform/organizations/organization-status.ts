import type { OwnerOrganization } from '../../../api/generated/models'

export const organizationStatusLabels: Record<OwnerOrganization['status'], string> = {
  active: 'Active',
  setup: 'Setup',
  paused: 'Paused',
  suspended: 'Suspended',
  pending_deletion: 'Pending deletion',
}
