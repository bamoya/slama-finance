import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

import type { SubscriptionEntitlements } from '../../src/contracts/generated/subscriptions/subscriptions.schemas.js'
import { platformUsers } from './organizations.js'
export const subscriptionPlans = pgTable('subscription_plans', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  entitlements: jsonb('entitlements').$type<SubscriptionEntitlements>().notNull(),
})
export const ownerSubscriptions = pgTable(
  'owner_subscriptions',
  {
    ownerId: uuid('owner_id')
      .primaryKey()
      .references(() => platformUsers.id, { onDelete: 'restrict' }),
    planCode: text('plan_code')
      .notNull()
      .references(() => subscriptionPlans.code),
    trialStartedAt: timestamp('trial_started_at', { withTimezone: true }).notNull(),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }).notNull(),
    paidThroughAt: timestamp('paid_through_at', { withTimezone: true }),
  },
  (t) => [
    pgPolicy('subscription_worker_read', {
      for: 'select',
      using: sql`current_setting('app.actor_type',true)='worker'`,
    }),
    check('trial_window', sql`${t.trialEndsAt}=${t.trialStartedAt}+interval '7 days'`),
    pgPolicy('subscription_scope', {
      for: 'all',
      using: sql`(${t.ownerId}=nullif(current_setting('app.owner_id',true),'')::uuid and current_setting('app.actor_type',true)='owner') or exists(select 1 from organizations o where o.id=nullif(current_setting('app.organization_id',true),'')::uuid and o.owner_id=${t.ownerId})`,
      withCheck: sql`(${t.ownerId}=nullif(current_setting('app.owner_id',true),'')::uuid and current_setting('app.actor_type',true)='owner') or exists(select 1 from organizations o where o.id=nullif(current_setting('app.organization_id',true),'')::uuid and o.owner_id=${t.ownerId})`,
    }),
  ],
).enableRLS()

// Durable usage survives business-record deletion and retry; only confirmed storage deletion releases bytes.
export const subscriptionStorage = pgTable(
  'subscription_storage',
  {
    objectKey: text('object_key').primaryKey(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => platformUsers.id, { onDelete: 'restrict' }),
    byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
    sha256: text('sha256').notNull(),
    stored: boolean('stored').notNull().default(false),
    version: integer('version').notNull().default(1),
    touchedAt: timestamp('touched_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('subscription_storage_size', sql`${t.byteSize}>0`),
    index('subscription_storage_owner').on(t.ownerId),
    pgPolicy('usage_owner', {
      for: 'all',
      using: sql`${t.ownerId}=nullif(current_setting('app.owner_id',true),'')::uuid and current_setting('app.actor_type',true)='owner'`,
      withCheck: sql`${t.ownerId}=nullif(current_setting('app.owner_id',true),'')::uuid and current_setting('app.actor_type',true)='owner'`,
    }),
  ],
).enableRLS()

export const subscriptionEmails = pgTable(
  'subscription_emails',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => platformUsers.id, { onDelete: 'restrict' }),
    messageKey: text('message_key').notNull().unique(),
    recipients: integer('recipients').notNull(),
    allowanceKey: text('allowance_key').notNull(),
    queuedAt: timestamp('queued_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('subscription_email_recipients', sql`${t.recipients}>0`),
    index('subscription_emails_owner_period').on(t.ownerId, t.queuedAt),
    pgPolicy('usage_owner', {
      for: 'all',
      using: sql`${t.ownerId}=nullif(current_setting('app.owner_id',true),'')::uuid and current_setting('app.actor_type',true)='owner'`,
      withCheck: sql`${t.ownerId}=nullif(current_setting('app.owner_id',true),'')::uuid and current_setting('app.actor_type',true)='owner'`,
    }),
  ],
).enableRLS()
