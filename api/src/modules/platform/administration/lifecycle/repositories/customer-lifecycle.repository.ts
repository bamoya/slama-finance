import { and, eq, isNull, sql } from 'drizzle-orm'

import { sessions } from '../../../../../../db/schema/auth.js'
import {
  organizations,
  ownerAccountTokens,
  ownerSessions,
  platformUsers,
} from '../../../../../../db/schema/organizations.js'
import type { Transaction } from '../../../../../lib/db.js'

/** Writes behind administrator lifecycle actions; always inside a platform_admin transaction. */
export function createCustomerLifecycleRepository() {
  return {
    async owner(id: string, tx: Transaction) {
      const [row] = await tx
        .select()
        .from(platformUsers)
        .where(eq(platformUsers.id, id))
        .for('update')
      return row
    },
    async createOwner(values: typeof platformUsers.$inferInsert, tx: Transaction) {
      const [row] = await tx
        .insert(platformUsers)
        .values(values)
        .onConflictDoNothing({ target: platformUsers.email })
        .returning()
      return row
    },
    async updateOwner(
      id: string,
      values: Partial<
        Pick<
          typeof platformUsers.$inferInsert,
          'blockedAt' | 'deletionRequestedAt' | 'deletionDueAt'
        >
      >,
      tx: Transaction,
    ) {
      await tx
        .update(platformUsers)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(platformUsers.id, id))
    },
    async revokeOwnerSessions(ownerId: string, now: Date, tx: Transaction) {
      await tx
        .update(ownerSessions)
        .set({ revokedAt: now })
        .where(and(eq(ownerSessions.ownerId, ownerId), isNull(ownerSessions.revokedAt)))
    },
    organizationIds: (ownerId: string, tx: Transaction) =>
      tx
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.ownerId, ownerId))
        .then((rows) => rows.map((r) => r.id)),
    async organization(id: string, tx: Transaction) {
      const [row] = await tx
        .select()
        .from(organizations)
        .where(eq(organizations.id, id))
        .for('update')
      return row
    },
    async setSuspension(id: string, suspendedAt: Date | null, tx: Transaction) {
      await tx
        .update(organizations)
        .set({ suspendedAt, suspensionSource: suspendedAt ? 'admin' : null, updatedAt: new Date() })
        .where(eq(organizations.id, id))
    },
    /** Staff sessions are tenant-scoped rows: briefly enter that organization's scope to revoke. */
    async revokeOrganizationSessions(organizationId: string, now: Date, tx: Transaction) {
      await tx.execute(sql`select set_config('app.organization_id',${organizationId},true)`)
      await tx
        .update(sessions)
        .set({ revokedAt: now })
        .where(and(eq(sessions.organizationId, organizationId), isNull(sessions.revokedAt)))
      await tx.execute(sql`select set_config('app.organization_id','',true)`)
    },
    /** Invalidates earlier invitations, then stores only the new token's hash. */
    async replaceInvitation(ownerId: string, tokenHash: string, expiresAt: Date, tx: Transaction) {
      await tx
        .update(ownerAccountTokens)
        .set({ consumedAt: new Date() })
        .where(
          and(
            eq(ownerAccountTokens.ownerId, ownerId),
            eq(ownerAccountTokens.purpose, 'invitation'),
            isNull(ownerAccountTokens.consumedAt),
          ),
        )
      await tx
        .insert(ownerAccountTokens)
        .values({ ownerId, purpose: 'invitation', tokenHash, expiresAt })
    },
    async invalidateInvitation(tokenHash: string, tx: Transaction) {
      await tx
        .update(ownerAccountTokens)
        .set({ consumedAt: new Date() })
        .where(eq(ownerAccountTokens.tokenHash, tokenHash))
    },
  }
}
