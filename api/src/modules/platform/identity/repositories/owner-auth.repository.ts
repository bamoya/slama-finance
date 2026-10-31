import { and, eq, gt, isNull } from 'drizzle-orm'

import {
  ownerAccountTokens,
  ownerSessions,
  platformUsers,
} from '../../../../../db/schema/organizations.js'
import type { Database } from '../../../../lib/db.js'

type Purpose = 'verify_email' | 'reset_password'
export function createOwnerAuthRepository(database: () => Database) {
  return {
    async register(input: typeof platformUsers.$inferInsert) {
      await database()
        .insert(platformUsers)
        .values(input)
        .onConflictDoNothing({ target: platformUsers.email })
    },
    async byEmail(email: string) {
      const [owner] = await database()
        .select()
        .from(platformUsers)
        .where(eq(platformUsers.email, email))
      return owner
    },
    async issueSession(
      ownerId: string,
      expectedPasswordHash: string,
      tokenHash: string,
      expiresAt: Date,
    ) {
      return database().transaction(async (tx) => {
        const [owner] = await tx
          .select()
          .from(platformUsers)
          .where(eq(platformUsers.id, ownerId))
          .for('update')
        if (
          !owner ||
          owner.disabledAt ||
          !owner.emailVerifiedAt ||
          owner.passwordHash !== expectedPasswordHash
        )
          return false
        await tx.insert(ownerSessions).values({ ownerId, tokenHash, expiresAt })
        return true
      })
    },
    async session(tokenHash: string) {
      const [row] = await database()
        .select({ owner: platformUsers })
        .from(ownerSessions)
        .innerJoin(platformUsers, eq(platformUsers.id, ownerSessions.ownerId))
        .where(
          and(
            eq(ownerSessions.tokenHash, tokenHash),
            isNull(ownerSessions.revokedAt),
            gt(ownerSessions.expiresAt, new Date()),
            isNull(platformUsers.disabledAt),
          ),
        )
      return row?.owner.emailVerifiedAt ? row.owner : undefined
    },
    async revoke(tokenHash: string) {
      await database()
        .update(ownerSessions)
        .set({ revokedAt: new Date() })
        .where(eq(ownerSessions.tokenHash, tokenHash))
    },
    async issueToken(email: string, purpose: Purpose, tokenHash: string, expiresAt: Date) {
      return database().transaction(async (tx) => {
        const [owner] = await tx
          .select()
          .from(platformUsers)
          .where(eq(platformUsers.email, email))
          .for('update')
        if (!owner || owner.disabledAt || (purpose === 'verify_email' && owner.emailVerifiedAt))
          return undefined
        const [recent] = await tx
          .select({ id: ownerAccountTokens.id })
          .from(ownerAccountTokens)
          .where(
            and(
              eq(ownerAccountTokens.ownerId, owner.id),
              eq(ownerAccountTokens.purpose, purpose),
              gt(ownerAccountTokens.createdAt, new Date(Date.now() - 60_000)),
            ),
          )
        if (recent) return undefined
        await tx
          .update(ownerAccountTokens)
          .set({ consumedAt: new Date() })
          .where(
            and(eq(ownerAccountTokens.ownerId, owner.id), eq(ownerAccountTokens.purpose, purpose)),
          )
        await tx
          .insert(ownerAccountTokens)
          .values({ ownerId: owner.id, purpose, tokenHash, expiresAt })
        return owner
      })
    },
    async invalidateToken(tokenHash: string) {
      await database()
        .update(ownerAccountTokens)
        .set({ consumedAt: new Date() })
        .where(eq(ownerAccountTokens.tokenHash, tokenHash))
    },
    async consumeToken(tokenHash: string, purpose: Purpose, passwordHash?: string) {
      return database().transaction(async (tx) => {
        const [candidate] = await tx
          .select()
          .from(ownerAccountTokens)
          .where(eq(ownerAccountTokens.tokenHash, tokenHash))
        if (!candidate) return false
        // Every credential mutation locks the owner first, then tokens, avoiding lock-order races.
        const [owner] = await tx
          .select()
          .from(platformUsers)
          .where(eq(platformUsers.id, candidate.ownerId))
          .for('update')
        if (!owner || owner.disabledAt) return false
        const [token] = await tx
          .select()
          .from(ownerAccountTokens)
          .where(
            and(
              eq(ownerAccountTokens.tokenHash, tokenHash),
              eq(ownerAccountTokens.purpose, purpose),
              isNull(ownerAccountTokens.consumedAt),
              gt(ownerAccountTokens.expiresAt, new Date()),
            ),
          )
          .for('update')
        if (!token) return false
        const now = new Date()
        if (purpose === 'verify_email') {
          await tx
            .update(platformUsers)
            .set({ emailVerifiedAt: now, updatedAt: now })
            .where(eq(platformUsers.id, owner.id))
        } else {
          if (!passwordHash) return false
          await tx
            .update(platformUsers)
            .set({ passwordHash, updatedAt: now })
            .where(eq(platformUsers.id, owner.id))
          await tx
            .update(ownerSessions)
            .set({ revokedAt: now })
            .where(eq(ownerSessions.ownerId, owner.id))
        }
        await tx
          .update(ownerAccountTokens)
          .set({ consumedAt: now })
          .where(
            and(eq(ownerAccountTokens.ownerId, owner.id), eq(ownerAccountTokens.purpose, purpose)),
          )
        return true
      })
    },
  }
}
