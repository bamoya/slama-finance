import { eq, sql } from 'drizzle-orm'

import { sessions } from '../../../../../../db/schema/auth.js'
import { organizations, platformUsers } from '../../../../../../db/schema/organizations.js'
import type { Database } from '../../../../../lib/db.js'

export function createOrganizationAuthRepository(database: () => Database) {
  return {
    async find(id: string) {
      // Pre-authentication lookup exposes no business data; RLS still limits this exact organization.
      return database().transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.organization_id',${id},true)`)
        const [row] = await tx
          .select({
            organization: organizations,
            ownerRestrictedAt:
              sql<Date | null>`coalesce(${platformUsers.blockedAt},${platformUsers.deletionRequestedAt})`.mapWith(
                (value) => (value ? new Date(value) : null),
              ),
          })
          .from(organizations)
          .innerJoin(platformUsers, eq(platformUsers.id, organizations.ownerId))
          .where(eq(organizations.id, id))
        if (!row) return undefined
        // A blocked or deleting customer makes every organization unavailable, like a suspension.
        return {
          ...row.organization,
          suspendedAt: row.organization.suspendedAt ?? row.ownerRestrictedAt,
        }
      })
    },
    async revokeSessions(id: string) {
      await database()
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(eq(sessions.organizationId, id))
    },
  }
}
