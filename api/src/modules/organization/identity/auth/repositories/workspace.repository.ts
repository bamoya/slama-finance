import { eq, sql } from 'drizzle-orm'

import { organizations } from '../../../../../../db/schema/organizations.js'
import type { Database } from '../../../../../lib/db.js'
export function createWorkspaceRepository(database: () => Database) {
  return {
    async read(id: string) {
      const [organization] = await database()
        .select()
        .from(organizations)
        .where(eq(organizations.id, id))
      const [defaults] = await database().execute(
        sql`select default_vat_rate from company_settings where id=1`,
      )
      const [count] = await database().execute(
        sql`select count(*)::int n from users where organization_id=${id}::uuid and archived_at is null and deleted_at is null`,
      )
      return {
        organization,
        defaultVatRate: defaults?.default_vat_rate as string | null,
        staffCount: Number(count?.n ?? 0),
      }
    },
  }
}
