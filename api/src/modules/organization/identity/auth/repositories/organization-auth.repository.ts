import { eq, sql } from 'drizzle-orm'

import { sessions } from '../../../../../../db/schema/auth.js'
import { organizations } from '../../../../../../db/schema/organizations.js'
import type { Database } from '../../../../../lib/db.js'

export function createOrganizationAuthRepository(database: () => Database) {
  return {
    async find(id: string) {
      // Pre-authentication lookup exposes no business data; RLS still limits this exact organization.
      return database().transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.organization_id',${id},true)`)
        const [organization] = await tx.select().from(organizations).where(eq(organizations.id, id))
        return organization
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
