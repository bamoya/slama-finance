import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  foreignKey,
  index,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { platformAdmins } from './administration.js'
import { platformUsers } from './organizations.js'
import { planVersions } from './subscription-catalog.js'
import { subscriptionPayments, subscriptionPlans } from './subscriptions.js'

const admin = sql`current_setting('app.actor_type',true)='platform_admin'`
/** Owner, its organizations and workers read coverage values; notes stay administrator-only. */
const reader = (owner: unknown) =>
  sql`current_setting('app.actor_type',true)='worker' or (${owner}=nullif(current_setting('app.owner_id',true),'')::uuid and current_setting('app.actor_type',true)='owner') or exists(select 1 from organizations o where o.id=nullif(current_setting('app.organization_id',true),'')::uuid and o.owner_id=${owner})`

/**
 * Coverage separated from payments (S5). Half-open [starts_at, least(ends_at, superseded_at)).
 * Trial, paid (exactly one confirmed payment) or complimentary (administrator grant, with a note).
 * Append-only: a later period may supersede the rest of an earlier one; nothing is deleted.
 * S5b: written beside the legacy rows (dual write); decisions still use the legacy resolver.
 */
export const subscriptionPeriods = pgTable(
  'subscription_periods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => platformUsers.id, { onDelete: 'restrict' }),
    kind: text('kind', { enum: ['trial', 'paid', 'complimentary'] }).notNull(),
    planCode: text('plan_code')
      .notNull()
      .references(() => subscriptionPlans.code),
    // Pinned catalog version; NULL until version pinning (S4/S8). Never inferred by the backfill.
    planVersionId: uuid('plan_version_id'),
    cycle: text('cycle', { enum: ['monthly', 'annual'] }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    source: text('source', { enum: ['trial', 'payment', 'admin_grant', 'migration'] }).notNull(),
    paymentId: uuid('payment_id').references(() => subscriptionPayments.id, {
      onDelete: 'restrict',
    }),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    supersededBy: uuid('superseded_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.planVersionId, t.planCode],
      foreignColumns: [planVersions.id, planVersions.planCode],
    }),
    foreignKey({ columns: [t.supersededBy], foreignColumns: [t.id] }),
    uniqueIndex('subscription_periods_payment').on(t.paymentId),
    uniqueIndex('subscription_periods_one_trial')
      .on(t.ownerId)
      .where(sql`${t.kind}='trial'`),
    index('subscription_periods_owner').on(t.ownerId, t.startsAt),
    check('subscription_period_window', sql`${t.endsAt}>${t.startsAt}`),
    check(
      'subscription_period_kind',
      sql`(${t.kind}='trial' and ${t.planCode}='trial' and ${t.cycle} is null and ${t.paymentId} is null and ${t.source} in ('trial','migration')) or (${t.kind}='paid' and ${t.planCode}<>'trial' and ${t.cycle} is not null and ${t.paymentId} is not null and ${t.source} in ('payment','migration')) or (${t.kind}='complimentary' and ${t.planCode}<>'trial' and ${t.source} in ('admin_grant','migration'))`,
    ),
    check(
      'subscription_period_supersession',
      sql`(${t.supersededAt} is null and ${t.supersededBy} is null) or (${t.supersededAt} is not null and ${t.supersededBy} is not null and ${t.supersededAt}>${t.startsAt} and ${t.supersededAt}<${t.endsAt})`,
    ),
    pgPolicy('subscription_period_admin', { for: 'all', using: admin, withCheck: admin }),
    pgPolicy('subscription_period_read', { for: 'select', using: reader(t.ownerId) }),
  ],
).enableRLS()

/** Administrator-only provenance of a period (grants and migration conversions). */
export const subscriptionPeriodNotes = pgTable(
  'subscription_period_notes',
  {
    periodId: uuid('period_id')
      .primaryKey()
      .references(() => subscriptionPeriods.id, { onDelete: 'restrict' }),
    reason: text('reason').notNull(),
    // NULL only for notes written by the migration itself.
    createdBy: uuid('created_by').references(() => platformAdmins.id, { onDelete: 'restrict' }),
  },
  (t) => [
    check(
      'subscription_period_note_reason',
      sql`btrim(${t.reason})<>'' and length(${t.reason})<=500`,
    ),
    pgPolicy('subscription_period_note_admin', { for: 'all', using: admin, withCheck: admin }),
  ],
).enableRLS()

/** Clock-freeze history. Resume records the applied shift instead of rewriting payments. */
export const subscriptionSuspensions = pgTable(
  'subscription_suspensions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => platformUsers.id, { onDelete: 'restrict' }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    shiftedByMs: bigint('shifted_by_ms', { mode: 'number' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('subscription_suspensions_one_open')
      .on(t.ownerId)
      .where(sql`${t.endedAt} is null`),
    check(
      'subscription_suspension_end',
      sql`(${t.endedAt} is null and ${t.shiftedByMs} is null) or (${t.endedAt}>=${t.startedAt} and ${t.shiftedByMs}>=0)`,
    ),
    pgPolicy('subscription_suspension_admin', { for: 'all', using: admin, withCheck: admin }),
    pgPolicy('subscription_suspension_read', { for: 'select', using: reader(t.ownerId) }),
  ],
).enableRLS()

/** Changes that take effect at a period boundary (cancellation, plan change, version transition). */
export const subscriptionScheduledChanges = pgTable(
  'subscription_scheduled_changes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => platformUsers.id, { onDelete: 'restrict' }),
    kind: text('kind', { enum: ['cancel', 'plan_change', 'version_transition'] }).notNull(),
    effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull(),
    targetPlanCode: text('target_plan_code').references(() => subscriptionPlans.code),
    targetCycle: text('target_cycle', { enum: ['monthly', 'annual'] }),
    targetPlanVersionId: uuid('target_plan_version_id').references(() => planVersions.id),
    noticeSentAt: timestamp('notice_sent_at', { withTimezone: true }),
    status: text('status', { enum: ['scheduled', 'applied', 'cancelled', 'superseded'] })
      .notNull()
      .default('scheduled'),
    // Typed actor: exactly one of the two ids matches created_by (none for the migration).
    createdBy: text('created_by', { enum: ['owner', 'admin', 'migration'] }).notNull(),
    actorOwnerId: uuid('actor_owner_id').references(() => platformUsers.id, {
      onDelete: 'restrict',
    }),
    actorAdminId: uuid('actor_admin_id').references(() => platformAdmins.id, {
      onDelete: 'restrict',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'subscription_scheduled_change_actor',
      sql`(${t.createdBy}='owner' and ${t.actorOwnerId}=${t.ownerId} and ${t.actorAdminId} is null) or (${t.createdBy}='admin' and ${t.actorAdminId} is not null and ${t.actorOwnerId} is null) or (${t.createdBy}='migration' and ${t.actorOwnerId} is null and ${t.actorAdminId} is null)`,
    ),
    uniqueIndex('subscription_scheduled_changes_one_active')
      .on(t.ownerId, t.kind)
      .where(sql`${t.status}='scheduled'`),
    check(
      'subscription_scheduled_change_target',
      sql`(${t.kind}='cancel' and ${t.targetPlanCode} is null and ${t.targetCycle} is null and ${t.targetPlanVersionId} is null) or (${t.kind}='plan_change' and ${t.targetPlanCode} is not null and ${t.targetPlanCode}<>'trial') or (${t.kind}='version_transition' and ${t.targetPlanVersionId} is not null and ${t.noticeSentAt} is not null and ${t.effectiveAt}>=${t.noticeSentAt}+interval '30 days')`,
    ),
    pgPolicy('subscription_scheduled_change_admin', {
      for: 'all',
      using: admin,
      withCheck: admin,
    }),
    pgPolicy('subscription_scheduled_change_read', { for: 'select', using: reader(t.ownerId) }),
    // Owners schedule and undo their own cancellation only.
    pgPolicy('subscription_scheduled_change_owner_cancel', {
      for: 'insert',
      withCheck: sql`${t.kind}='cancel' and ${t.createdBy}='owner' and ${t.actorOwnerId}=${t.ownerId} and ${t.ownerId}=nullif(current_setting('app.owner_id',true),'')::uuid and current_setting('app.actor_type',true)='owner'`,
    }),
    pgPolicy('subscription_scheduled_change_owner_undo', {
      for: 'update',
      using: sql`${t.kind}='cancel' and ${t.ownerId}=nullif(current_setting('app.owner_id',true),'')::uuid and current_setting('app.actor_type',true)='owner'`,
      withCheck: sql`${t.kind}='cancel' and ${t.ownerId}=nullif(current_setting('app.owner_id',true),'')::uuid and current_setting('app.actor_type',true)='owner'`,
    }),
  ],
).enableRLS()
