import { sql } from 'drizzle-orm'
import {
  bigint,
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

// SaaS administrators are a separate realm: never platform owners or organization staff.
const adminOnly = sql`current_setting('app.actor_type',true)='platform_admin'`

export const platformAdmins = pgTable(
  'platform_admins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    name: text('name').notNull(),
    // AES-256-GCM ciphertext; never returned after enrollment.
    totpSecret: text('totp_secret'),
    totpEnrolledAt: timestamp('totp_enrolled_at', { withTimezone: true }),
    // Last accepted RFC 6238 time step; codes at or before it are replays.
    totpLastStep: bigint('totp_last_step', { mode: 'number' }),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('platform_admins_email_unique').on(t.email),
    check(
      'platform_admins_email_normalized',
      sql`${t.email} = lower(btrim(${t.email})) and ${t.email} <> ''`,
    ),
    check('platform_admins_name_present', sql`btrim(${t.name}) <> ''`),
    check(
      'platform_admins_enrollment',
      sql`${t.totpEnrolledAt} is null or ${t.totpSecret} is not null`,
    ),
    pgPolicy('platform_admins_admin_only', { for: 'all', using: adminOnly, withCheck: adminOnly }),
  ],
).enableRLS()

export const platformAdminSessions = pgTable(
  'platform_admin_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminId: uuid('admin_id')
      .notNull()
      .references(() => platformAdmins.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    // Null while the second factor is pending; only verified sessions authorize admin routes.
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    failedAttempts: integer('failed_attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('platform_admin_sessions_token_unique').on(t.tokenHash),
    index('platform_admin_sessions_admin_idx').on(t.adminId),
    check('platform_admin_sessions_window', sql`${t.expiresAt} > ${t.createdAt}`),
    pgPolicy('platform_admin_sessions_admin_only', {
      for: 'all',
      using: adminOnly,
      withCheck: adminOnly,
    }),
  ],
).enableRLS()

// Append-only: runtime has SELECT/INSERT only and a trigger rejects UPDATE/DELETE.
export const platformAdminAudit = pgTable(
  'platform_admin_audit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminId: uuid('admin_id').references(() => platformAdmins.id, { onDelete: 'restrict' }),
    // Admin email, or 'cli' for operator tooling; retained even if the admin is disabled.
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('platform_admin_audit_created_idx').on(t.createdAt),
    pgPolicy('platform_admin_audit_read', { for: 'select', using: adminOnly }),
    pgPolicy('platform_admin_audit_insert', { for: 'insert', withCheck: adminOnly }),
  ],
).enableRLS()
