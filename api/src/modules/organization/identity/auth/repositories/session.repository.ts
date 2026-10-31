import { and, eq, gt, isNull, sql } from 'drizzle-orm'

import { sessions } from '../../../../../../db/schema/auth.js'
import type { Database, Transaction } from '../../../../../lib/db.js'
import { staffOrganizationScope } from '../../../../../lib/staff-organization-scope.js'

export function createSessionRepository(database: () => Database, organizationId?: string) {
  return {
    async create(
      userId: string,
      tokenHash: string,
      expiresAt: Date,
      purpose: 'full' | 'password_change',
      tx: Database | Transaction = database(),
    ) {
      await tx.insert(sessions).values({ userId, tokenHash, expiresAt, purpose, organizationId })
    },
    async findActive(tokenHash: string, tx: Database | Transaction = database()) {
      const [session] = await tx
        .select()
        .from(sessions)
        .where(
          and(
            eq(sessions.tokenHash, tokenHash),
            staffOrganizationScope(sessions.organizationId, organizationId),
            sql`exists(select 1 from organizations where id=${sessions.organizationId} and activated_at is not null and paused_at is null and suspended_at is null and deletion_requested_at is null and not exists(select 1 from platform_users p where p.id=organizations.owner_id and (p.blocked_at is not null or p.deletion_requested_at is not null)))`,
            gt(sessions.expiresAt, new Date()),
            isNull(sessions.revokedAt),
          ),
        )
        .limit(1)
      return session
    },
    async revoke(tokenHash: string) {
      await database()
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(sessions.tokenHash, tokenHash),
            staffOrganizationScope(sessions.organizationId, organizationId),
            sql`exists(select 1 from organizations where id=${sessions.organizationId} and activated_at is not null and paused_at is null and suspended_at is null and deletion_requested_at is null and not exists(select 1 from platform_users p where p.id=organizations.owner_id and (p.blocked_at is not null or p.deletion_requested_at is not null)))`,
          ),
        )
    },
  }
}
