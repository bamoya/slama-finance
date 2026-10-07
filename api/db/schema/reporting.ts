import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { users } from './auth.js'

export const reportSchedules = pgTable(
  'report_schedules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    frequency: text('frequency').notNull(),
    language: text('language').notNull().default('fr'),
    output: text('output').notNull().default('pdf'),
    weekday: integer('weekday'),
    monthDay: integer('month_day'),
    localTime: text('local_time').notNull(),
    timezone: text('timezone').notNull(),
    period: text('period').notNull(),
    includedSections: text('included_sections').array().notNull(),
    enabled: boolean('enabled').notNull().default(false),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
  },
  (t) => [
    index('report_schedules_due_idx')
      .on(t.nextRunAt)
      .where(sql`${t.enabled} and ${t.archivedAt} is null`),
    check('report_schedules_name', sql`length(trim(${t.name})) between 1 and 160`),
    check('report_schedules_version', sql`${t.version} > 0`),
    check('report_schedules_language', sql`${t.language} in ('fr', 'en')`),
    check('report_schedules_output', sql`${t.output} in ('pdf', 'excel', 'both')`),
    check(
      'report_schedules_cadence',
      sql`(${t.frequency}='daily' and ${t.weekday} is null and ${t.monthDay} is null) or (${t.frequency}='weekly' and ${t.weekday} is not null and ${t.weekday} between 1 and 7 and ${t.monthDay} is null) or (${t.frequency}='monthly' and ${t.weekday} is null and ${t.monthDay} is not null and ${t.monthDay} between 1 and 28)`,
    ),
    check('report_schedules_time', sql`${t.localTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
    check(
      'report_schedules_period',
      sql`${t.period} in ('previous_day','previous_week','previous_month')`,
    ),
    check(
      'report_schedules_sections',
      sql`cardinality(${t.includedSections}) between 1 and 13 and ${t.includedSections} <@ array['summary','revenue','collections','outstanding','overdue','payment_methods','pending_cheques','vat','sales_by_client','sales_by_product','sales_by_category','estimates','deliveries']::text[]`,
    ),
    check(
      'report_schedules_sections_unique',
      sql`array_position(${t.includedSections}, null) is null and cardinality(${t.includedSections}) = (case when 'summary'=any(${t.includedSections}) then 1 else 0 end + case when 'revenue'=any(${t.includedSections}) then 1 else 0 end + case when 'collections'=any(${t.includedSections}) then 1 else 0 end + case when 'outstanding'=any(${t.includedSections}) then 1 else 0 end + case when 'overdue'=any(${t.includedSections}) then 1 else 0 end + case when 'payment_methods'=any(${t.includedSections}) then 1 else 0 end + case when 'pending_cheques'=any(${t.includedSections}) then 1 else 0 end + case when 'vat'=any(${t.includedSections}) then 1 else 0 end + case when 'sales_by_client'=any(${t.includedSections}) then 1 else 0 end + case when 'sales_by_product'=any(${t.includedSections}) then 1 else 0 end + case when 'sales_by_category'=any(${t.includedSections}) then 1 else 0 end + case when 'estimates'=any(${t.includedSections}) then 1 else 0 end + case when 'deliveries'=any(${t.includedSections}) then 1 else 0 end)`,
    ),
    check(
      'report_schedules_active',
      sql`(${t.enabled} and ${t.nextRunAt} is not null and ${t.archivedAt} is null) or (not ${t.enabled} and ${t.nextRunAt} is null)`,
    ),
  ],
)
export const reportScheduleRecipients = pgTable(
  'report_schedule_recipients',
  {
    scheduleId: uuid('schedule_id')
      .notNull()
      .references(() => reportSchedules.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
  },
  (t) => [
    primaryKey({ columns: [t.scheduleId, t.userId] }),
    index('report_schedule_recipients_user_idx').on(t.userId),
  ],
)
export const reportRuns = pgTable(
  'report_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scheduleId: uuid('schedule_id')
      .notNull()
      .references(() => reportSchedules.id, { onDelete: 'restrict' }),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
    trigger: text('trigger').notNull().default('scheduled'),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    configurationSnapshot: jsonb('configuration_snapshot').notNull(),
    dataSnapshot: jsonb('data_snapshot'),
    dataCapturedAt: timestamp('data_captured_at', { withTimezone: true }),
    recipientOutcomes: jsonb('recipient_outcomes').notNull().default([]),
    status: text('status').notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    leaseToken: uuid('lease_token'),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    errorCode: text('error_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
  },
  (t) => [
    uniqueIndex('report_runs_occurrence_uq')
      .on(t.scheduleId, t.scheduledFor)
      .where(sql`${t.trigger} = 'scheduled'`),
    check(
      'report_runs_trigger',
      sql`${t.trigger} in ('scheduled', 'test') and (${t.trigger} <> 'test' or ${t.createdByUserId} is not null)`,
    ),
    index('report_runs_retry_idx').on(t.status, t.nextAttemptAt),
    index('report_runs_lease_idx')
      .on(t.lockedUntil)
      .where(sql`${t.status}='running'`),
    check(
      'report_runs_status',
      sql`${t.status} in ('queued','running','succeeded','failed','cancelled')`,
    ),
    check(
      'report_runs_attempts',
      sql`${t.attempts} >= 0 and ${t.maxAttempts} > 0 and ${t.attempts} <= ${t.maxAttempts}`,
    ),
    check('report_runs_period', sql`${t.periodStart} <= ${t.periodEnd}`),
    check(
      'report_runs_capture_pair',
      sql`(${t.dataSnapshot} is null) = (${t.dataCapturedAt} is null)`,
    ),
    check(
      'report_runs_lease',
      sql`(${t.status}='running' and ${t.leaseToken} is not null and ${t.lockedUntil} is not null) or (${t.status}<>'running' and ${t.leaseToken} is null and ${t.lockedUntil} is null)`,
    ),
    check(
      'report_runs_complete',
      sql`${t.status} not in ('succeeded','failed','cancelled') or ${t.finishedAt} is not null`,
    ),
    check(
      'report_runs_succeeded_capture',
      sql`${t.status}<>'succeeded' or ${t.dataSnapshot} is not null`,
    ),
  ],
)
