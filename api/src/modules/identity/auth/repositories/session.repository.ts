import { and, eq, gt, isNull } from 'drizzle-orm'

import { sessions } from '../../../../../db/schema/auth.js'
import type { Database, Transaction } from '../../../../lib/db.js'
import { SESSION_IDLE_MS } from '../session-policy.js'

export function createSessionRepository(database: () => Database) {
  return {
    async create(
      userId: string,
      tokenHash: string,
      expiresAt: Date,
      purpose: 'full' | 'password_change',
      tx: Database | Transaction = database(),
    ) {
      await tx.insert(sessions).values({ userId, tokenHash, expiresAt, purpose })
    },
    async findActive(tokenHash: string, tx: Database | Transaction = database()) {
      const [session] = await tx
        .select()
        .from(sessions)
        .where(
          and(
            eq(sessions.tokenHash, tokenHash),
            gt(sessions.expiresAt, new Date()),
            gt(sessions.lastSeenAt, new Date(Date.now() - SESSION_IDLE_MS)),
            isNull(sessions.revokedAt),
          ),
        )
        .limit(1)
      return session
    },
    async recordActivity(tokenHash: string) {
      const now = new Date()
      const [session] = await database()
        .update(sessions)
        .set({ lastSeenAt: now })
        .where(
          and(
            eq(sessions.tokenHash, tokenHash),
            gt(sessions.expiresAt, now),
            gt(sessions.lastSeenAt, new Date(now.getTime() - SESSION_IDLE_MS)),
            isNull(sessions.revokedAt),
          ),
        )
        .returning({ id: sessions.id })
      return !!session
    },
    async revoke(tokenHash: string) {
      await database()
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(eq(sessions.tokenHash, tokenHash))
    },
  }
}
