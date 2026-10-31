import { and, eq, sql } from 'drizzle-orm'

import { passwordResetTokens, sessions, users } from '../../../../../../db/schema/auth.js'
import type { Database, Transaction } from '../../../../../lib/db.js'
import { staffOrganizationScope } from '../../../../../lib/staff-organization-scope.js'

export function createAuthRepository(database: () => Database, organizationId?: string) {
  return {
    async updateProfile(
      id: string,
      input: { firstName: string; lastName: string; email: string },
      tx: Transaction,
    ) {
      const [user] = await tx
        .update(users)
        .set({ ...input, emailVerifiedAt: null, updatedAt: new Date() })
        .where(and(eq(users.id, id), staffOrganizationScope(users.organizationId, organizationId)))
        .returning()
      await tx
        .update(passwordResetTokens)
        .set({ consumedAt: new Date() })
        .where(eq(passwordResetTokens.userId, id))
      return user!
    },
    transaction: <T>(work: (tx: Transaction) => Promise<T>) => database().transaction(work),
    async lock(tx: Transaction) {
      await tx.execute(sql`select pg_advisory_xact_lock(73619001)`)
    },
    async consumeTemporary(id: string, tx: Transaction) {
      await tx
        .update(users)
        .set({ temporaryPasswordConsumedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(users.id, id), staffOrganizationScope(users.organizationId, organizationId)))
    },
    async changePassword(id: string, passwordHash: string, tx: Transaction) {
      const now = new Date()
      const [user] = await tx
        .update(users)
        .set({
          passwordHash,
          mustChangePassword: false,
          temporaryPasswordExpiresAt: null,
          temporaryPasswordConsumedAt: null,
          passwordChangedAt: now,
          updatedAt: now,
        })
        .where(and(eq(users.id, id), staffOrganizationScope(users.organizationId, organizationId)))
        .returning()
      await tx.update(sessions).set({ revokedAt: now }).where(eq(sessions.userId, id))
      await tx
        .update(passwordResetTokens)
        .set({ consumedAt: now })
        .where(eq(passwordResetTokens.userId, id))
      return user!
    },
    async findByEmail(email: string) {
      const [user] = await database()
        .select()
        .from(users)
        .where(
          and(
            eq(users.email, email),
            staffOrganizationScope(users.organizationId, organizationId),
            sql`exists(select 1 from organizations where id=${users.organizationId} and activated_at is not null and paused_at is null and suspended_at is null and deletion_requested_at is null and not exists(select 1 from platform_users p where p.id=organizations.owner_id and (p.blocked_at is not null or p.deletion_requested_at is not null)))`,
          ),
        )
        .limit(1)
      return user
    },
    async findById(id: string, tx: Database | Transaction = database()) {
      const [user] = await tx
        .select()
        .from(users)
        .where(and(eq(users.id, id), staffOrganizationScope(users.organizationId, organizationId)))
        .limit(1)
      return user
    },
  }
}
