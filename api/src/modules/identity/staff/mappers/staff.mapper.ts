import type { StaffCreated } from '../../../../contracts/generated/identity/staff.schemas.js'
export function toStaff(
  user: Omit<StaffCreated, 'disabledAt' | 'archivedAt'> & {
    disabledAt: Date | null
    archivedAt: Date | null
  },
): StaffCreated {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    disabledAt: user.disabledAt?.toISOString() ?? null,
    archivedAt: user.archivedAt?.toISOString() ?? null,
  }
}
