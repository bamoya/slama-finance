import type { User } from '../../contracts/generated/identity/auth.schemas.js'
import type { Transaction } from '../../lib/db.js'
export interface ReportingRecipient {
  id: string
  name: string
  email: string
  eligible: boolean
  reasons: string[]
}
export interface IdentityPublicApi {
  resolveSession(token?: string): Promise<User | null>
  authorize(token: string | undefined, permission: string): Promise<{ userId: string } | null>
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
