import type { User } from '../../../../../contracts/generated/identity/auth.schemas.js'
export interface WorkspaceIdentity {
  resolveSession(token?: string, identityType?: 'owner' | 'staff'): Promise<User | null>
  grants(id: string): Promise<string[]>
}
