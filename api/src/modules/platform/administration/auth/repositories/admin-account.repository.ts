import { and, eq, isNotNull, isNull, or, sql } from 'drizzle-orm'

import {
  platformAdmins,
  platformAdminSessions,
} from '../../../../../../db/schema/administration.js'
import type { Transaction } from '../../../../../lib/db.js'

export type AdminRow = typeof platformAdmins.$inferSelect

export function createAdminAccountRepository() {
  return {
    async byEmail(email: string, tx: Transaction) {
      const [row] = await tx
        .select()
        .from(platformAdmins)
        .where(eq(platformAdmins.email, email))
        .for('update')
      return row
    },
    async byId(id: string, tx: Transaction) {
      const [row] = await tx
        .select()
        .from(platformAdmins)
        .where(eq(platformAdmins.id, id))
        .for('update')
      return row
    },
    async create(values: typeof platformAdmins.$inferInsert, tx: Transaction) {
      const [row] = await tx
        .insert(platformAdmins)
        .values(values)
        .onConflictDoNothing({ target: platformAdmins.email })
        .returning()
      return row
    },
    async updateAdmin(
      id: string,
      values: Partial<typeof platformAdmins.$inferInsert>,
      tx: Transaction,
    ) {
      const [row] = await tx
        .update(platformAdmins)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(platformAdmins.id, id))
        .returning()
      return row
    },
    /** Atomically accepts a TOTP step only if it is newer than the last accepted one. */
    async acceptStep(id: string, step: number, now: Date, tx: Transaction) {
      const [row] = await tx
        .update(platformAdmins)
        .set({
          totpLastStep: step,
          totpEnrolledAt: sql`coalesce(${platformAdmins.totpEnrolledAt}, ${now.toISOString()}::timestamptz)`,
          updatedAt: now,
        })
        .where(
          and(
            eq(platformAdmins.id, id),
            isNull(platformAdmins.disabledAt),
            isNotNull(platformAdmins.totpSecret),
            or(isNull(platformAdmins.totpLastStep), sql`${platformAdmins.totpLastStep} < ${step}`),
          ),
        )
        .returning()
      return row
    },
    async insertSession(values: typeof platformAdminSessions.$inferInsert, tx: Transaction) {
      const [row] = await tx.insert(platformAdminSessions).values(values).returning()
      return row!
    },
    async session(tokenHash: string, tx: Transaction) {
      const [row] = await tx
        .select({ session: platformAdminSessions, admin: platformAdmins })
        .from(platformAdminSessions)
        .innerJoin(platformAdmins, eq(platformAdmins.id, platformAdminSessions.adminId))
        .where(
          and(
            eq(platformAdminSessions.tokenHash, tokenHash),
            isNull(platformAdminSessions.revokedAt),
          ),
        )
        .for('update', { of: platformAdminSessions })
      return row
    },
    async updateSession(
      id: string,
      values: Partial<typeof platformAdminSessions.$inferInsert>,
      tx: Transaction,
    ) {
      await tx.update(platformAdminSessions).set(values).where(eq(platformAdminSessions.id, id))
    },
    revokeAll: (adminId: string, now: Date, tx: Transaction) =>
      tx
        .update(platformAdminSessions)
        .set({ revokedAt: now })
        .where(
          and(eq(platformAdminSessions.adminId, adminId), isNull(platformAdminSessions.revokedAt)),
        ),
  }
}
