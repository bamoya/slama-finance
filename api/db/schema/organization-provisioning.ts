import { sql } from 'drizzle-orm'
import { check, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { users } from './auth.js'
import { organizationColumn, tenantPolicy } from './tenant.js'

// Only password hashes live in users. Temporary cleartext credentials exist in worker memory only.
export const organizationAdminDeliveries = pgTable(
  'organization_admin_deliveries',
  {
    organizationId: organizationColumn().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
    leaseId: uuid('lease_id'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    lastErrorCode: text('last_error_code'),
  },
  (t) => [
    tenantPolicy(t.organizationId),
    check(
      'admin_delivery_status',
      sql`${t.status} in ('pending','sending','sent','skipped','failed')`,
    ),
    check('admin_delivery_attempts', sql`${t.attempts}>=0 and ${t.attempts}<=5`),
  ],
).enableRLS()
