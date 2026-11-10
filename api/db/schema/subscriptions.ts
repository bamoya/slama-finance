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
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import type { SubscriptionEntitlements } from '../../src/contracts/generated/subscriptions/subscriptions.schemas.js'
import { platformUsers } from './organizations.js'
export const subscriptionPlans = pgTable('subscription_plans', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  entitlements: jsonb('entitlements').$type<SubscriptionEntitlements>().notNull(),
  // Approved HT prices in centimes; annual charges ten months for twelve.
  rank: integer('rank').notNull().default(0),
  monthlyHt: integer('monthly_ht').notNull().default(0),
  annualHt: integer('annual_ht').notNull().default(0),
})

// Single-row platform billing configuration. Tax applies only when legally applicable.
export const billingSettings = pgTable(
  'billing_settings',
  {
    id: integer('id').primaryKey().default(1),
    currency: text('currency').notNull().default('MAD'),
    taxRateBasisPoints: integer('tax_rate_basis_points'),
    paymentMethods: text('payment_methods')
      .array()
      .notNull()
      .default(sql`'{bank_transfer,cash}'::text[]`),
    paymentInstructions: text('payment_instructions').notNull().default(''),
  },
  (t) => [
    check('billing_settings_singleton', sql`${t.id}=1`),
    check(
      'billing_settings_tax',
      sql`${t.taxRateBasisPoints} is null or ${t.taxRateBasisPoints} between 0 and 10000`,
    ),
  ],
)
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
    // Trial version pin: set by the database from plan_selling at creation (the NULL default is
    // replaced by a BEFORE INSERT trigger), immutable afterwards. FK in integrity SQL.
    trialPlanCode: text('trial_plan_code').notNull().default('trial'),
    trialPlanVersionId: uuid('trial_plan_version_id')
      .notNull()
      .default(sql`null`),
    paidThroughAt: timestamp('paid_through_at', { withTimezone: true }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    // Administrator suspension freezes the coverage clock; resume shifts coverage by its length.
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
  },
  (t) => [
    pgPolicy('subscription_worker_read', {
      for: 'select',
      using: sql`current_setting('app.actor_type',true)='worker'`,
    }),
    pgPolicy('subscription_admin', {
      for: 'all',
      using: sql`current_setting('app.actor_type',true)='platform_admin'`,
      withCheck: sql`current_setting('app.actor_type',true)='platform_admin'`,
    }),
    // Seven days at start; administrator extensions and suspensions may lengthen it.
    check('trial_plan_code', sql`${t.trialPlanCode}='trial'`),
    check('trial_window', sql`${t.trialEndsAt}>=${t.trialStartedAt}+interval '7 days'`),
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

// Manual SaaS payments. Never confused with tenant invoice payments; amounts are immutable snapshots.
export const subscriptionPayments = pgTable(
  'subscription_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => platformUsers.id, { onDelete: 'restrict' }),
    planCode: text('plan_code')
      .notNull()
      .references(() => subscriptionPlans.code),
    // Version whose terms and price were quoted; set by the writer, immutable (integrity SQL FK).
    planVersionId: uuid('plan_version_id').notNull(),
    cycle: text('cycle', { enum: ['monthly', 'annual'] }).notNull(),
    kind: text('kind', { enum: ['activation', 'renewal', 'upgrade'] }).notNull(),
    status: text('status', { enum: ['submitted', 'confirmed', 'rejected'] })
      .notNull()
      .default('submitted'),
    method: text('method').notNull(),
    reference: text('reference').notNull(),
    currency: text('currency').notNull(),
    amountHt: integer('amount_ht').notNull(),
    taxRateBasisPoints: integer('tax_rate_basis_points'),
    taxAmount: integer('tax_amount').notNull(),
    amountTtc: integer('amount_ttc').notNull(),
    coverageStart: timestamp('coverage_start', { withTimezone: true }),
    coverageEnd: timestamp('coverage_end', { withTimezone: true }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decidedBy: text('decided_by'),
    receivedReference: text('received_reference'),
    // Shown to the owner; required whenever an administrator rejects a payment.
    rejectionReason: text('rejection_reason'),
    // Complimentary trial activation: legacy reads end access at its coverage end, without grace.
    graceless: boolean('graceless').notNull().default(false),
  },
  (t) => [
    check(
      'subscription_payment_amounts',
      sql`${t.amountHt}>=0 and ${t.taxAmount}>=0 and ${t.amountTtc}=${t.amountHt}+${t.taxAmount}`,
    ),
    check(
      'subscription_payment_coverage',
      sql`(${t.status}='confirmed')=(${t.coverageStart} is not null and ${t.coverageEnd}>${t.coverageStart})`,
    ),
    check(
      'subscription_payment_graceless',
      sql`not ${t.graceless} or (${t.method}='admin_adjustment' and ${t.amountTtc}=0)`,
    ),
    check('subscription_payment_reference', sql`btrim(${t.reference})<>''`),
    check(
      'subscription_payment_rejection_reason',
      sql`(${t.status}='rejected')=(${t.rejectionReason} is not null and btrim(${t.rejectionReason})<>'')`,
    ),
    uniqueIndex('subscription_payments_one_open')
      .on(t.ownerId)
      .where(sql`${t.status}='submitted'`),
    index('subscription_payments_owner').on(t.ownerId, t.submittedAt),
    // Owners read and submit; only administrators may decide (update) a payment.
    pgPolicy('subscription_payment_owner', {
      for: 'select',
      using: sql`(${t.ownerId}=nullif(current_setting('app.owner_id',true),'')::uuid and current_setting('app.actor_type',true)='owner') or exists(select 1 from organizations o where o.id=nullif(current_setting('app.organization_id',true),'')::uuid and o.owner_id=${t.ownerId})`,
    }),
    pgPolicy('subscription_payment_owner_submit', {
      for: 'insert',
      withCheck: sql`${t.ownerId}=nullif(current_setting('app.owner_id',true),'')::uuid and current_setting('app.actor_type',true)='owner'`,
    }),
    pgPolicy('subscription_payment_admin', {
      for: 'all',
      using: sql`current_setting('app.actor_type',true)='platform_admin'`,
      withCheck: sql`current_setting('app.actor_type',true)='platform_admin'`,
    }),
  ],
).enableRLS()
