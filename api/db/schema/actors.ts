import { sql } from 'drizzle-orm'
import { check, pgPolicy, pgTable, text, uuid } from 'drizzle-orm/pg-core'

import { users } from './auth.js'
import { platformUsers } from './organizations.js'

/** An audit/attribution identity, never an additional account or a staff membership. */
export const actors = pgTable(
  'actors',
  {
    id: uuid('id').primaryKey(),
    kind: text('kind').notNull(),
    staffId: uuid('staff_id').references(() => users.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id').references(() => platformUsers.id, { onDelete: 'restrict' }),
  },
  (t) => [
    check(
      'actor_identity',
      sql`(${t.kind}='staff' and ${t.staffId}=${t.id} and ${t.ownerId} is null) or (${t.kind}='owner' and ${t.ownerId}=${t.id} and ${t.staffId} is null)`,
    ),
    pgPolicy('actor_scope', {
      for: 'all',
      using: sql`(${t.ownerId}=nullif(current_setting('app.owner_id',true),'')::uuid and current_setting('app.actor_type',true)='owner') or exists(select 1 from organizations o where o.id=nullif(current_setting('app.organization_id',true),'')::uuid and (o.owner_id=${t.ownerId} or exists(select 1 from users u where u.id=${t.staffId} and u.organization_id=o.id)))`,
      withCheck: sql`(${t.ownerId}=nullif(current_setting('app.owner_id',true),'')::uuid and current_setting('app.actor_type',true)='owner') or exists(select 1 from organizations o where o.id=nullif(current_setting('app.organization_id',true),'')::uuid and (o.owner_id=${t.ownerId} or exists(select 1 from users u where u.id=${t.staffId} and u.organization_id=o.id)))`,
    }),
  ],
).enableRLS()
