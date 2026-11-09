import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

import { platformAdmins } from './administration.js'
import { platformUsers } from './organizations.js'
import { entitlementDefinitions } from './subscription-catalog.js'

const admin = sql`current_setting('app.actor_type',true)='platform_admin'`

/**
 * Effective-dated replacement of one plan value for one owner subscription. Records are
 * append-only: revocation sets the revoked_* fields once; amendments revoke and insert.
 * Half-open window [starts_at, least(ends_at, revoked_at)); unrevoked windows of the same
 * owner and key never overlap (integrity trigger, serialized per owner+key).
 */
export const subscriptionOverrides = pgTable(
  'subscription_overrides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => platformUsers.id, { onDelete: 'restrict' }),
    entitlementKey: text('entitlement_key').notNull(),
    valueType: text('value_type', { enum: ['boolean', 'integer'] }).notNull(),
    booleanValue: boolean('boolean_value'),
    integerValue: bigint('integer_value', { mode: 'number' }),
    isUnlimited: boolean('is_unlimited').notNull().default(false),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    replacesId: uuid('replaces_id'),
  },
  (t) => [
    foreignKey({
      columns: [t.entitlementKey, t.valueType],
      foreignColumns: [entitlementDefinitions.key, entitlementDefinitions.valueType],
    }),
    foreignKey({ columns: [t.replacesId], foreignColumns: [t.id] }),
    index('subscription_overrides_owner_key').on(t.ownerId, t.entitlementKey, t.startsAt),
    check(
      'subscription_override_value',
      sql`(${t.valueType}='boolean' and ${t.booleanValue} is not null and ${t.integerValue} is null and not ${t.isUnlimited}) or (${t.valueType}='integer' and ${t.booleanValue} is null and ((${t.isUnlimited} and ${t.integerValue} is null) or (not ${t.isUnlimited} and ${t.integerValue} is not null and ${t.integerValue} between 0 and 9007199254740991)))`,
    ),
    check('subscription_override_window', sql`${t.endsAt} is null or ${t.endsAt}>${t.startsAt}`),
    pgPolicy('subscription_override_admin', { for: 'all', using: admin, withCheck: admin }),
    // Values and windows only; administrator notes live in subscription_override_notes.
    pgPolicy('subscription_override_read', {
      for: 'select',
      using: sql`current_setting('app.actor_type',true)='worker' or (${t.ownerId}=nullif(current_setting('app.owner_id',true),'')::uuid and current_setting('app.actor_type',true)='owner') or exists(select 1 from organizations o where o.id=nullif(current_setting('app.organization_id',true),'')::uuid and o.owner_id=${t.ownerId})`,
    }),
  ],
).enableRLS()

/** Administrator-only notes and identities of each override; never readable by tenants or workers. */
export const subscriptionOverrideNotes = pgTable(
  'subscription_override_notes',
  {
    overrideId: uuid('override_id')
      .primaryKey()
      .references(() => subscriptionOverrides.id, { onDelete: 'restrict' }),
    reason: text('reason').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => platformAdmins.id, { onDelete: 'restrict' }),
    revokedBy: uuid('revoked_by').references(() => platformAdmins.id, { onDelete: 'restrict' }),
    revocationReason: text('revocation_reason'),
  },
  (t) => [
    check(
      'subscription_override_note_reason',
      sql`btrim(${t.reason})<>'' and length(${t.reason})<=500`,
    ),
    check(
      'subscription_override_note_revocation',
      sql`(${t.revokedBy} is null and ${t.revocationReason} is null) or (${t.revokedBy} is not null and btrim(${t.revocationReason})<>'' and length(${t.revocationReason})<=500)`,
    ),
    pgPolicy('subscription_override_note_admin', { for: 'all', using: admin, withCheck: admin }),
  ],
).enableRLS()
