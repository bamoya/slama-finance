import { sql } from 'drizzle-orm'
import { check, integer, jsonb, pgPolicy, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'

import { organizations } from './organizations.js'

/** Isolated setup data; never writes to the legacy singleton company settings. */
export const organizationProfiles = pgTable(
  'organization_profiles',
  {
    organizationId: uuid('organization_id')
      .primaryKey()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    configuration: jsonb('configuration').notNull(),
    currentStep: integer('current_step').notNull().default(1),
    version: integer('version').notNull().default(1),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('organization_profile_step', sql`${t.currentStep} between 1 and 6`),
    check('organization_profile_version', sql`${t.version}>0`),
    pgPolicy('organization_profile_owner', {
      for: 'all',
      using: sql`current_setting('app.actor_type',true)='owner' and exists(select 1 from organizations o where o.id=${t.organizationId} and o.owner_id=nullif(current_setting('app.owner_id',true),'')::uuid)`,
      withCheck: sql`current_setting('app.actor_type',true)='owner' and exists(select 1 from organizations o where o.id=${t.organizationId} and o.owner_id=nullif(current_setting('app.owner_id',true),'')::uuid)`,
    }),
  ],
).enableRLS()
