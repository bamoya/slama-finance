import { asc, count, desc, eq, ilike, or, sql } from 'drizzle-orm'

import { organizations, platformUsers } from '../../../../../../db/schema/organizations.js'
import type { Transaction } from '../../../../../lib/db.js'

const like = (value: string) => `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`

export function createAdminCustomerRepository() {
  return {
    async owners(search: string | undefined, page: number, pageSize: number, tx: Transaction) {
      const term = search?.trim()
      const where = term
        ? or(
            ilike(platformUsers.email, like(term)),
            ilike(
              sql`concat_ws(' ',${platformUsers.firstName},${platformUsers.lastName})`,
              like(term),
            ),
          )
        : undefined
      const organizationCount = sql<number>`(select count(*)::int from organizations o where o.owner_id=platform_users.id)`
      const [rows, [total]] = await Promise.all([
        tx
          .select({ owner: platformUsers, organizationCount })
          .from(platformUsers)
          .where(where)
          .orderBy(desc(platformUsers.createdAt), asc(platformUsers.id))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        tx.select({ n: count() }).from(platformUsers).where(where),
      ])
      return { rows, total: total?.n ?? 0 }
    },
    async owner(id: string, tx: Transaction) {
      const [row] = await tx.select().from(platformUsers).where(eq(platformUsers.id, id))
      return row
    },
    ownerOrganizations: (ownerId: string, tx: Transaction) =>
      tx
        .select({
          id: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
          createdAt: organizations.createdAt,
          activatedAt: organizations.activatedAt,
        })
        .from(organizations)
        .where(eq(organizations.ownerId, ownerId))
        .orderBy(asc(organizations.createdAt)),
  }
}
