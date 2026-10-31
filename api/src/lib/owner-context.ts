import { sql } from 'drizzle-orm'

import type { Database, Transaction } from './db.js'

/** Only authenticated platform-owner identities may establish this transaction context. */
export function withOwnerTransaction<T>(
  database: Database,
  ownerId: string,
  work: (tx: Transaction) => Promise<T>,
) {
  return database.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.actor_type','owner',true),set_config('app.owner_id',${ownerId},true),set_config('app.organization_id','',true)`,
    )
    return work(tx)
  })
}
