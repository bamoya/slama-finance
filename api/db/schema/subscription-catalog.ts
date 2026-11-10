import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  foreignKey,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import { subscriptionPlans } from './subscriptions.js'

const admin = sql`current_setting('app.actor_type',true)='platform_admin'`
const reader = sql`(current_setting('app.actor_type',true) in ('owner','worker','platform_admin') or nullif(current_setting('app.organization_id',true),'') is not null)`
export const entitlementDefinitions = pgTable(
  'entitlement_definitions',
  {
    key: text('key').primaryKey(),
    valueType: text('value_type', { enum: ['boolean', 'integer'] }).notNull(),
    unit: text('unit', { enum: ['flag', 'count', 'byte', 'recipient'] }).notNull(),
    kind: text('kind', { enum: ['feature', 'capacity', 'consumption'] }).notNull(),
    scope: text('scope', { enum: ['owner', 'organization'] }).notNull(),
    unlimitedAllowed: boolean('unlimited_allowed').notNull(),
  },
  (t) => [
    unique('entitlement_definition_key_type').on(t.key, t.valueType),
    check('entitlement_definition_scope', sql`${t.scope} in ('owner','organization')`),
    check(
      'entitlement_definition_shape',
      sql`(${t.valueType}='boolean' and ${t.unit}='flag' and ${t.kind}='feature' and not ${t.unlimitedAllowed}) or (${t.valueType}='integer' and ((${t.unit} in ('count','byte') and ${t.kind}='capacity') or (${t.unit}='recipient' and ${t.kind}='consumption')))`,
    ),
    pgPolicy('entitlement_definitions_migration_write', {
      for: 'all',
      using: sql`pg_has_role(current_user,(select relowner from pg_class where oid='entitlement_definitions'::regclass),'MEMBER')`,
      withCheck: sql`pg_has_role(current_user,(select relowner from pg_class where oid='entitlement_definitions'::regclass),'MEMBER')`,
    }),
    pgPolicy('entitlement_definition_read', { for: 'select', using: reader }),
  ],
).enableRLS()

export const planVersions = pgTable(
  'plan_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planCode: text('plan_code')
      .notNull()
      .references(() => subscriptionPlans.code),
    versionNumber: integer('version_number').notNull(),
    status: text('status', { enum: ['draft', 'published'] })
      .notNull()
      .default('draft'),
    displayName: text('display_name').notNull(),
    rank: integer('rank').notNull(),
    revision: integer('revision').notNull().default(1),
    sourceSnapshot: jsonb('source_snapshot'),
    sourceHash: text('source_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedBy: text('published_by'),
  },
  (t) => [
    unique('plan_version_number').on(t.planCode, t.versionNumber),
    unique('plan_version_identity').on(t.id, t.planCode),
    check('plan_version_numbers', sql`${t.versionNumber}>0 and ${t.revision}>0 and ${t.rank}>=0`),
    check('plan_version_name', sql`btrim(${t.displayName})<>''`),
    check(
      'plan_version_publication',
      sql`(${t.status}='draft' and ${t.publishedAt} is null and ${t.publishedBy} is null) or (${t.status}='published' and ${t.publishedAt} is not null and ${t.publishedBy} is not null and btrim(${t.publishedBy})<>'')`,
    ),
    check(
      'plan_version_provenance',
      sql`(${t.sourceSnapshot} is null and ${t.sourceHash} is null) or (${t.sourceSnapshot} is not null and ${t.sourceHash} is not null and ${t.sourceHash} ~ '^[a-f0-9]{64}$')`,
    ),
    pgPolicy('plan_versions_migration_write', {
      for: 'all',
      using: sql`pg_has_role(current_user,(select relowner from pg_class where oid='plan_versions'::regclass),'MEMBER')`,
      withCheck: sql`pg_has_role(current_user,(select relowner from pg_class where oid='plan_versions'::regclass),'MEMBER')`,
    }),
    pgPolicy('plan_version_read', {
      for: 'select',
      using: sql`${admin} or (${reader} and ${t.status}='published')`,
    }),
  ],
).enableRLS()

export const planEntitlements = pgTable(
  'plan_entitlements',
  {
    planVersionId: uuid('plan_version_id')
      .notNull()
      .references(() => planVersions.id),
    entitlementKey: text('entitlement_key').notNull(),
    valueType: text('value_type', { enum: ['boolean', 'integer'] }).notNull(),
    booleanValue: boolean('boolean_value'),
    integerValue: bigint('integer_value', { mode: 'number' }),
    isUnlimited: boolean('is_unlimited').notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.planVersionId, t.entitlementKey] }),
    foreignKey({
      columns: [t.entitlementKey, t.valueType],
      foreignColumns: [entitlementDefinitions.key, entitlementDefinitions.valueType],
    }),
    check(
      'plan_entitlement_value',
      sql`(${t.valueType}='boolean' and ${t.booleanValue} is not null and ${t.integerValue} is null and not ${t.isUnlimited}) or (${t.valueType}='integer' and ${t.booleanValue} is null and ((${t.isUnlimited} and ${t.integerValue} is null) or (not ${t.isUnlimited} and ${t.integerValue} is not null and ${t.integerValue} between 0 and 9007199254740991)))`,
    ),
    pgPolicy('plan_entitlements_migration_write', {
      for: 'all',
      using: sql`pg_has_role(current_user,(select relowner from pg_class where oid='plan_entitlements'::regclass),'MEMBER')`,
      withCheck: sql`pg_has_role(current_user,(select relowner from pg_class where oid='plan_entitlements'::regclass),'MEMBER')`,
    }),
    pgPolicy('plan_entitlement_read', {
      for: 'select',
      using: sql`exists(select 1 from plan_versions v where v.id=${t.planVersionId})`,
    }),
  ],
).enableRLS()

export const planVersionPrices = pgTable(
  'plan_version_prices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planVersionId: uuid('plan_version_id')
      .notNull()
      .references(() => planVersions.id),
    cycle: text('cycle', { enum: ['monthly', 'annual'] }).notNull(),
    currency: text('currency').notNull().default('MAD'),
    amountHtMinor: bigint('amount_ht_minor', { mode: 'number' }).notNull(),
  },
  (t) => [
    unique('plan_version_price_cycle').on(t.planVersionId, t.cycle, t.currency),
    check(
      'plan_version_price_value',
      sql`${t.amountHtMinor} between 0 and 9007199254740991 and ${t.currency}='MAD' and ${t.cycle} in ('monthly','annual')`,
    ),
    pgPolicy('plan_version_prices_migration_write', {
      for: 'all',
      using: sql`pg_has_role(current_user,(select relowner from pg_class where oid='plan_version_prices'::regclass),'MEMBER')`,
      withCheck: sql`pg_has_role(current_user,(select relowner from pg_class where oid='plan_version_prices'::regclass),'MEMBER')`,
    }),
    pgPolicy('plan_version_price_read', {
      for: 'select',
      using: sql`exists(select 1 from plan_versions v where v.id=${t.planVersionId})`,
    }),
  ],
).enableRLS()

/**
 * Selling authority (S2): the one published version new sales, trials and grants receive per plan.
 * NULL version = withdrawn (no new sales; existing pins stay readable and same-plan renewals keep
 * them). Migration role only, audited; the trial cannot be withdrawn. Never repins anyone.
 */
export const planSelling = pgTable(
  'plan_selling',
  {
    planCode: text('plan_code')
      .primaryKey()
      .references(() => subscriptionPlans.code),
    planVersionId: uuid('plan_version_id'),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
    changedBy: text('changed_by').notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.planVersionId, t.planCode],
      foreignColumns: [planVersions.id, planVersions.planCode],
    }),
    check('plan_selling_actor', sql`btrim(${t.changedBy})<>''`),
    check('plan_selling_trial', sql`${t.planCode}<>'trial' or ${t.planVersionId} is not null`),
    pgPolicy('plan_selling_migration_write', {
      for: 'all',
      using: sql`pg_has_role(current_user,(select relowner from pg_class where oid='plan_selling'::regclass),'MEMBER')`,
      withCheck: sql`pg_has_role(current_user,(select relowner from pg_class where oid='plan_selling'::regclass),'MEMBER')`,
    }),
    pgPolicy('plan_selling_read', { for: 'select', using: reader }),
  ],
).enableRLS()
