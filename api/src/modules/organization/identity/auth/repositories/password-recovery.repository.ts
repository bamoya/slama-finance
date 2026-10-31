import { and, eq, gt, isNull, sql } from 'drizzle-orm'

import { passwordResetTokens, sessions, users } from '../../../../../../db/schema/auth.js'
import { companySettings } from '../../../../../../db/schema/settings.js'
import type { Database } from '../../../../../lib/db.js'
import { staffOrganizationScope } from '../../../../../lib/staff-organization-scope.js'

export function createPasswordRecoveryRepository(
  database: () => Database,
  organizationId?: string,
  organizationLocale?: string,
) {
  return {
    async companyLocale() {
      if (organizationLocale) return organizationLocale
      const [row] = await database()
        .select({ locale: companySettings.locale })
        .from(companySettings)
        .where(eq(companySettings.id, 1))
      return row?.locale ?? 'fr-MA'
    },
    async issue(email: string, tokenHash: string, expiresAt: Date) {
      return database().transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(73619001)`)
        const [user] = await tx
          .select()
          .from(users)
          .where(
            and(
              eq(users.email, email),
              staffOrganizationScope(users.organizationId, organizationId),
              isNull(users.disabledAt),
              isNull(users.archivedAt),
            ),
          )
        if (!user) return false
        const [recent] = await tx
          .select({ id: passwordResetTokens.id })
          .from(passwordResetTokens)
          .where(
            and(
              eq(passwordResetTokens.userId, user.id),
              gt(passwordResetTokens.createdAt, new Date(Date.now() - 60_000)),
            ),
          )
        if (recent) return false
        await tx
          .update(passwordResetTokens)
          .set({ consumedAt: new Date() })
          .where(eq(passwordResetTokens.userId, user.id))
        await tx
          .insert(passwordResetTokens)
          .values({ userId: user.id, email, tokenHash, expiresAt, organizationId })
        return true
      })
    },
    async invalidate(tokenHash: string) {
      await database()
        .update(passwordResetTokens)
        .set({ consumedAt: new Date() })
        .where(
          and(
            eq(passwordResetTokens.tokenHash, tokenHash),
            staffOrganizationScope(passwordResetTokens.organizationId, organizationId),
          ),
        )
    },
    async consume(tokenHash: string, passwordHash: string) {
      return database().transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(73619001)`)
        const [token] = await tx
          .select()
          .from(passwordResetTokens)
          .where(
            and(
              eq(passwordResetTokens.tokenHash, tokenHash),
              staffOrganizationScope(passwordResetTokens.organizationId, organizationId),
              isNull(passwordResetTokens.consumedAt),
              gt(passwordResetTokens.expiresAt, new Date()),
            ),
          )
          .for('update')
        if (!token) return false
        const [user] = await tx
          .select()
          .from(users)
          .where(
            and(
              eq(users.id, token.userId),
              staffOrganizationScope(users.organizationId, organizationId),
              eq(users.email, token.email),
              isNull(users.disabledAt),
              isNull(users.archivedAt),
            ),
          )
        if (!user) return false
        const now = new Date()
        await tx
          .update(users)
          .set({
            passwordHash,
            mustChangePassword: false,
            temporaryPasswordExpiresAt: null,
            temporaryPasswordConsumedAt: null,
            passwordChangedAt: now,
            updatedAt: now,
          })
          .where(eq(users.id, user.id))
        await tx
          .update(passwordResetTokens)
          .set({ consumedAt: now })
          .where(eq(passwordResetTokens.userId, user.id))
        await tx.update(sessions).set({ revokedAt: now }).where(eq(sessions.userId, user.id))
        return true
      })
    },
  }
}
