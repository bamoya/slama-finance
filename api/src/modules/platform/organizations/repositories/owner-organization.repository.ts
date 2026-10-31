import { and, count, eq, ilike, isNull, or, sql } from 'drizzle-orm'

import { users } from '../../../../../db/schema/auth.js'
import { organizations } from '../../../../../db/schema/organizations.js'
import type { ListOwnerOrganizationsQuery } from '../../../../contracts/generated/identity/owner-organizations.schemas.js'
import type { Database, Transaction } from '../../../../lib/db.js'

export function createOwnerOrganizationRepository(database: () => Database) {
  const status = sql<string>`case when ${organizations.deletionRequestedAt} is not null then 'pending_deletion' when ${organizations.suspendedAt} is not null then 'suspended' when ${organizations.pausedAt} is not null then 'paused' when ${organizations.activatedAt} is null then 'setup' else 'active' end`
  const selection = {
    organization: organizations,
    staffCount: sql<number>`0::int`,
  }
  const withOwner = <T>(ownerId: string, work: (tx: Transaction) => Promise<T>) =>
    database().transaction(async (tx) => {
      // ownerId is resolved from an authenticated platform session, never from request query/body.
      await tx.execute(
        sql`select set_config('app.actor_type','owner',true),set_config('app.owner_id',${ownerId},true),set_config('app.organization_id','',true)`,
      )
      return work(tx)
    })
  const staffCount = async <
    T extends { organization: typeof organizations.$inferSelect; staffCount: number },
  >(
    row: T,
    tx: Transaction,
  ): Promise<T> => {
    // The row was already checked under owner policies. Count only this organization's staff,
    // without granting owner-portal SQL a second, broader policy on the staff table.
    await tx.execute(sql`select set_config('app.organization_id',${row.organization.id},true)`)
    const [result] = await tx
      .select({ value: count() })
      .from(users)
      .where(
        and(
          eq(users.organizationId, row.organization.id),
          isNull(users.archivedAt),
          isNull(users.deletedAt),
        ),
      )
    await tx.execute(sql`select set_config('app.organization_id','',true)`)
    return { ...row, staffCount: result!.value }
  }
  return {
    list(ownerId: string, query: ListOwnerOrganizationsQuery) {
      return withOwner(ownerId, async (tx) => {
        const where = and(
          eq(organizations.ownerId, ownerId),
          query.q
            ? or(
                ilike(organizations.name, `%${query.q.trim()}%`),
                ilike(organizations.slug, `%${query.q.trim()}%`),
              )
            : undefined,
          query.status ? sql`${status}=${query.status}` : undefined,
        )
        const items = await tx
          .select(selection)
          .from(organizations)
          .where(where)
          .orderBy(organizations.createdAt, organizations.id)
          .limit(query.pageSize)
          .offset((query.page - 1) * query.pageSize)
        const [total] = await tx.select({ value: count() }).from(organizations).where(where)
        const counted = []
        for (const row of items) counted.push(await staffCount(row, tx))
        return { items: counted, total: total!.value, page: query.page, pageSize: query.pageSize }
      })
    },
    get(ownerId: string, id: string) {
      return withOwner(ownerId, async (tx) => {
        const [row] = await tx
          .select(selection)
          .from(organizations)
          .where(and(eq(organizations.id, id), eq(organizations.ownerId, ownerId)))
        return row ? staffCount(row, tx) : undefined
      })
    },
  }
}
