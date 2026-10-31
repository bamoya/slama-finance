import { eq, sql } from 'drizzle-orm'

import { organizations } from '../../db/schema/organizations.js'
import type { Database, Transaction } from './db.js'

/**
 * Pre-authentication host resolution. Reads organization identity only (id, slug, name) under the
 * dedicated host_resolver row policy; it never grants access or exposes business data.
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
  }
}
