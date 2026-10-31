import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
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

import { actors } from './actors.js'
import { clients } from './clients.js'
import { organizationColumn, tenantPolicy } from './tenant.js'

const audit = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdByActorId: uuid('created_by_actor_id').references(() => actors.id, {
    onDelete: 'set null',
  }),
  updatedByActorId: uuid('updated_by_actor_id').references(() => actors.id, {
    onDelete: 'set null',
  }),
})

export const notificationRules = pgTable(
  'notification_rules',
  {
    organizationId: organizationColumn(),
    id: uuid('id').primaryKey().defaultRandom(),
    eventKey: text('event_key').notNull(),
    enabled: boolean('enabled').notNull().default(false),
    offsetDays: integer('offset_days').notNull().default(0),
    repeatEveryDays: integer('repeat_every_days'),
    senderName: text('sender_name').notNull().default('Slama Finance'),
    senderEmail: text('sender_email').notNull().default('notifications@example.invalid'),
    locale: text('locale').notNull().default('company'),
    englishSubjectTemplate: text('english_subject_template'),
    englishBodyTemplate: text('english_body_template'),
    subjectTemplate: text('subject_template').notNull(),
    bodyTemplate: text('body_template').notNull(),
    bodyFormat: text('body_format').notNull().default('text'),
    version: integer('version').notNull().default(1),
    ...audit(),
  },
  (t) => [
    tenantPolicy(t.organizationId),
    uniqueIndex('notification_rules_eventKey_tenant_unique').on(t.organizationId, t.eventKey),
    check(
      'notification_rules_event',
      sql`${t.eventKey} in ('invoice_sent','estimate_sent','payment_received','delivery_prepared','invoice_due_reminder','estimate_expiry_reminder')`,
    ),
    check(
      'notification_rules_timing',
      sql`${t.offsetDays} between -365 and 365 and (${t.repeatEveryDays} is null or ${t.repeatEveryDays} between 1 and 365) and (${t.eventKey} in ('invoice_due_reminder','estimate_expiry_reminder') or (${t.offsetDays} = 0 and ${t.repeatEveryDays} is null))`,
    ),
    check('notification_rules_version', sql`${t.version} > 0`),
    check('notification_rules_body_format', sql`${t.bodyFormat} in ('text','html')`),
    check('notification_rules_locale', sql`${t.locale} in ('company','fr-MA','en-GB')`),
  ],
).enableRLS()

export const clientNotificationPreferences = pgTable(
  'client_notification_preferences',
  {
    organizationId: organizationColumn(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    ruleId: uuid('rule_id')
      .notNull()
      .references(() => notificationRules.id, { onDelete: 'restrict' }),
    enabled: boolean('enabled').notNull(),
    cc: jsonb('cc').$type<string[]>().notNull().default([]),
    version: integer('version').notNull().default(1),
    ...audit(),
  },
  (t) => [
    tenantPolicy(t.organizationId),
    primaryKey({ columns: [t.clientId, t.ruleId] }),
    check('client_notification_preferences_version', sql`${t.version} > 0`),
  ],
).enableRLS()

export const outboundMessages = pgTable(
  'outbound_messages',
  {
    organizationId: organizationColumn(),
    id: uuid('id').primaryKey().defaultRandom(),
    to: text('to_address').notNull(),
    cc: jsonb('cc').$type<string[]>().notNull().default([]),
    fromEmail: text('from_email').notNull(),
    fromName: text('from_name').notNull(),
    subject: text('subject').notNull(),
    html: text('html').notNull(),
    text: text('text_body').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    payloadHash: text('payload_hash').notNull(),
    status: text('status').notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
    leaseToken: uuid('lease_token'),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    firstAttemptAt: timestamp('first_attempt_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    providerMessageId: text('provider_message_id'),
    lastErrorCode: text('last_error_code'),
    payloadErasedAt: timestamp('payload_erased_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdByActorId: uuid('created_by_actor_id').references(() => actors.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [
    tenantPolicy(t.organizationId),
    uniqueIndex('outbound_messages_idempotencyKey_tenant_unique').on(
      t.organizationId,
      t.idempotencyKey,
    ),
    index('outbound_messages_claim_idx').on(t.organizationId, t.status, t.availableAt),
    index('outbound_messages_lease_idx').on(t.organizationId, t.status, t.lockedUntil),
    index('outbound_messages_provider_idx').on(t.organizationId, t.providerMessageId),
    check(
      'outbound_messages_status',
      sql`${t.status} in ('queued','sending','sent','failed','cancelled')`,
    ),
    check(
      'outbound_messages_attempts',
      sql`${t.attempts} >= 0 and ${t.maxAttempts} > 0 and ${t.attempts} <= ${t.maxAttempts}`,
    ),
    check(
      'outbound_messages_lease',
      sql`(${t.status} = 'sending') = (${t.leaseToken} is not null and ${t.lockedUntil} is not null)`,
    ),
    check(
      'outbound_messages_completion',
      sql`(${t.status} = 'sent') = (${t.sentAt} is not null and ${t.providerMessageId} is not null)`,
    ),
    check('outbound_messages_hash', sql`${t.payloadHash} ~ '^[a-f0-9]{64}$'`),
  ],
).enableRLS()

export const outboundMessageAttachments = pgTable(
  'outbound_message_attachments',
  {
    organizationId: organizationColumn(),
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => outboundMessages.id, { onDelete: 'restrict' }),
    objectKey: text('object_key').notNull(),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    tenantPolicy(t.organizationId),
    check(
      'attachment_storage_scope',
      sql`starts_with(${t.objectKey}, 'organizations/' || ${t.organizationId}::text || '/artifacts/')`,
    ),
    uniqueIndex('outbound_message_attachments_position_uq').on(
      t.organizationId,
      t.messageId,
      t.position,
    ),
    index('outbound_message_attachments_key_idx').on(t.organizationId, t.objectKey),
    check('outbound_message_attachments_size', sql`${t.byteSize} > 0 and ${t.byteSize} <= 8388608`),
    check('outbound_message_attachments_position', sql`${t.position} >= 0`),
  ],
).enableRLS()

export const notificationDispatches = pgTable(
  'notification_dispatches',
  {
    organizationId: organizationColumn(),
    id: uuid('id').primaryKey().defaultRandom(),
    sourceType: text('source_type').notNull(),
    sourceId: uuid('source_id').notNull(),
    eventKey: text('event_key').notNull(),
    occurrenceKey: text('occurrence_key').notNull(),
    logicalOccurrenceKey: text('logical_occurrence_key').notNull(),
    isManual: boolean('is_manual').notNull().default(false),
    messageId: uuid('message_id')
      .notNull()

      .references(() => outboundMessages.id, { onDelete: 'restrict' }),
    reconciledAt: timestamp('reconciled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdByActorId: uuid('created_by_actor_id').references(() => actors.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [
    tenantPolicy(t.organizationId),
    uniqueIndex('notification_dispatches_messageId_tenant_unique').on(
      t.organizationId,
      t.messageId,
    ),
    uniqueIndex('notification_dispatches_occurrence_uq').on(
      t.organizationId,
      t.sourceType,
      t.sourceId,
      t.eventKey,
      t.occurrenceKey,
    ),
    uniqueIndex('notification_dispatches_logical_uq').on(
      t.organizationId,
      t.sourceType,
      t.sourceId,
      t.eventKey,
      t.logicalOccurrenceKey,
    ),
    index('notification_dispatches_source_idx').on(
      t.organizationId,
      t.sourceType,
      t.sourceId,
      t.createdAt,
    ),
    check(
      'notification_dispatches_source',
      sql`${t.sourceType} in ('invoice','estimate','payment','delivery_note','report_run')`,
    ),
    check(
      'notification_dispatches_event',
      sql`${t.eventKey} in ('invoice_sent','estimate_sent','payment_received','delivery_prepared','invoice_due_reminder','estimate_expiry_reminder','report_available')`,
    ),
  ],
).enableRLS()
