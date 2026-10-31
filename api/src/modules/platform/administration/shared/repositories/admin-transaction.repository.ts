import { sql } from 'drizzle-orm'

import type { Database, Transaction } from '../../../../../lib/db.js'

/** Every administration query runs in the platform_admin RLS context, never owner/staff. */
export const createAdminTransaction =
  (database: () => Database) =>
  <T>(work: (tx: Transaction) => Promise<T>) =>
    database().transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('app.actor_type','platform_admin',true),set_config('app.owner_id','',true),set_config('app.organization_id','',true)`,
      )
      return work(tx)
    })

export type AdminTransaction = ReturnType<typeof createAdminTransaction>
