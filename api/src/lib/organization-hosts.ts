import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm'

import { organizations, organizationSlugHistory } from '../../db/schema/organizations.js'
import type { Database, Transaction } from './db.js'

/**
 * Pre-authentication host resolution. Reads organization identity only (id, slug, name) under the
 * dedicated host_resolver row policies; it never grants access or exposes business data.
 */
export function createOrganizationHosts(database: () => Database) {
  const read = <T>(work: (tx: Transaction) => Promise<T>) =>
    database().transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.actor_type','host_resolver',true)`)
      return work(tx)
    })
  const identity = { id: organizations.id, slug: organizations.slug, name: organizations.name }
  return {
    async bySlug(slug: string) {
      const [row] = await read((tx) =>
        tx.select(identity).from(organizations).where(eq(organizations.slug, slug)),
      )
      return row
    },
    /** Current identity of the organization that formerly used this slug. */
    async byFormerSlug(slug: string) {
      const [row] = await read((tx) =>
        tx
          .select(identity)
          .from(organizationSlugHistory)
          .innerJoin(organizations, eq(organizations.id, organizationSlugHistory.organizationId))
          .where(eq(organizationSlugHistory.slug, slug)),
      )
      return row
    },
    /** Current slug of an active organization only; anything else is indistinguishable from unknown. */
    async activeSlug(id: string) {
      const [row] = await read((tx) =>
        tx
          .select({ slug: organizations.slug })
          .from(organizations)
          .where(
            and(
              eq(organizations.id, id),
              isNotNull(organizations.activatedAt),
              isNull(organizations.pausedAt),
              isNull(organizations.suspendedAt),
              isNull(organizations.deletionRequestedAt),
            ),
          ),
      )
      return row?.slug
    },
    /** Current slug by id (any lifecycle state) for building organization email links. */
    async slugOf(id: string) {
      const [row] = await read((tx) =>
        tx.select({ slug: organizations.slug }).from(organizations).where(eq(organizations.id, id)),
      )
      return row?.slug
    },
  }
}
export type OrganizationHosts = ReturnType<typeof createOrganizationHosts>
