import { sql } from 'drizzle-orm'
import { type AnyPgColumn, pgPolicy, uuid } from 'drizzle-orm/pg-core'

import { organizations } from './organizations.js'

/** Required scope. Inserts outside a tenant transaction fail instead of using a global tenant. */
export const organizationColumn = () =>
  uuid('organization_id')
    .notNull()
    .default(sql`nullif(current_setting('app.organization_id', true), '')::uuid`)
    .references(() => organizations.id, { onDelete: 'restrict' })

export const tenantPolicy = (column: AnyPgColumn) =>
  pgPolicy('tenant_isolation', {
    for: 'all',
    using: sql`${column} = nullif(current_setting('app.organization_id', true), '')::uuid`,
    withCheck: sql`${column} = nullif(current_setting('app.organization_id', true), '')::uuid`,
  })
