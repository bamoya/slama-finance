import type { AdminOwnerDetailOrganizationsItem } from '../../../../../api/generated/models'

export type CustomerAction =
  | { kind: 'activate-plan' }
  | { kind: 'change-plan' }
  | { kind: 'extend' }
  | { kind: 'suspend-subscription' }
  | { kind: 'resume-subscription' }
  | { kind: 'block' }
  | { kind: 'unblock' }
  | { kind: 'resend-invitation' }
  | { kind: 'delete' }
  | { kind: 'cancel-deletion' }
  | { kind: 'suspend-organization'; organization: AdminOwnerDetailOrganizationsItem }
  | { kind: 'reactivate-organization'; organization: AdminOwnerDetailOrganizationsItem }
  | { kind: 'change-address'; organization: AdminOwnerDetailOrganizationsItem }
