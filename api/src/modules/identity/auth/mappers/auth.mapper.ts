import type { Session, User } from '../../../../contracts/generated/identity/auth.schemas.js'

export function toSession(
  user: User,
  purpose: Session['purpose'] = 'full',
  permissionKeys: string[] = [],
): Session {
  return {
    permissionKeys: purpose === 'full' ? permissionKeys : [],
    purpose,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
    },
  }
}
