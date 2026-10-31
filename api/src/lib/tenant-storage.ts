import { sql } from 'drizzle-orm'

import type { Database } from './db.js'

/** Resolve from the scoped connection, also supporting explicitly scoped service transactions. */
export async function tenantObjectKey(database: Database, path: string) {
  if (path.startsWith('/') || path.split('/').some((part) => part === '.' || part === '..'))
    throw new Error('Invalid object path')
  const [row] = await database.execute(
    sql`select current_setting('app.organization_id',true) as id`,
  )
  if (typeof row?.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(row.id))
    throw new Error('Organization context required for object storage')
  return `organizations/${row.id}/${path}`
}
