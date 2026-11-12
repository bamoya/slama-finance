import { sql } from 'drizzle-orm'
import { check, integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core'

import { organizationColumn, tenantPolicy } from './tenant.js'

/**
 * Gap-free numbering of an organization's documents per series (FAC invoice, DEV estimate,
 * BL delivery note, PAY payment/receipt) and calendar year of the company timezone. The row is
 * advanced inside the issuing transaction, so a rollback leaves no gap.
 */
export const documentNumberCounters = pgTable(
  'document_number_counters',
  {
    organizationId: organizationColumn(),
    series: text('series', { enum: ['FAC', 'DEV', 'BL', 'PAY'] }).notNull(),
    year: integer('year').notNull(),
    last: integer('last').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.series, t.year] }),
    check('document_number_counter_last', sql`${t.last} > 0`),
    check('document_number_counter_series', sql`${t.series} in ('FAC','DEV','BL','PAY')`),
    tenantPolicy(t.organizationId),
  ],
).enableRLS()
