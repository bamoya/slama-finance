import { and, asc, count, desc, eq, ilike, or, sql } from 'drizzle-orm'

import { organizations, platformUsers } from '../../../../../../db/schema/organizations.js'
import type { Transaction } from '../../../../../lib/db.js'
import { subscriptionLifecycle } from '../../shared/repositories/subscription-lifecycle.repository.js'

const like = (value: string) => `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`

export function createAdminCustomerRepository() {
  return {
    async owners(
      search: string | undefined,
      status: string | undefined,
      page: number,
      pageSize: number,
      now: Date,
      tx: Transaction,
    ) {
      const term = search?.trim()
      const matches = term
        ? or(
            ilike(platformUsers.email, like(term)),
            ilike(platformUsers.firstName, like(term)),
            ilike(platformUsers.lastName, like(term)),
            ilike(
              sql`concat_ws(' ',${platformUsers.firstName},${platformUsers.lastName})`,
              like(term),
            ),
          )
        : undefined
      const where = and(
        matches,
        status === 'not_started'
          ? sql`${platformUsers.id} not in (select owner_id from owner_subscriptions)`
          : status
            ? sql`${platformUsers.id} in (select owner_id from (${subscriptionLifecycle(sql`${now.toISOString()}::timestamptz`)}) l where l.status=${status})`
            : undefined,
      )
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
          pausedAt: organizations.pausedAt,
          suspendedAt: organizations.suspendedAt,
          deletionRequestedAt: organizations.deletionRequestedAt,
        })
        .from(organizations)
        .where(eq(organizations.ownerId, ownerId))
        .orderBy(asc(organizations.createdAt)),
  }
}
