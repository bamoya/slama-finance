import { sql } from 'drizzle-orm'
import { check, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { users } from './auth.js'

export const backgroundJobs = pgTable(
  'background_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobType: text('job_type').notNull(),
    payloadVersion: integer('payload_version').notNull().default(1),
    payload: jsonb('payload').notNull(),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    status: text('status').notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
    leaseToken: uuid('lease_token'),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    lastErrorCode: text('last_error_code'),
    initiatedByUserId: uuid('initiated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('background_jobs_claim_idx').on(t.status, t.availableAt, t.lockedUntil),
    check('background_jobs_type', sql`${t.jobType} in ('prepare_pdf','prepare_notification')`),
    check(
      'background_jobs_status',
      sql`${t.status} in ('queued','running','succeeded','failed','cancelled')`,
    ),
    check(
      'background_jobs_attempts',
      sql`${t.attempts} >= 0 and ${t.maxAttempts} > 0 and ${t.attempts} <= ${t.maxAttempts}`,
    ),
    check('background_jobs_payload_version', sql`${t.payloadVersion} > 0`),
  ],
)
