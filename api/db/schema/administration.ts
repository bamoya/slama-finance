import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  customType,
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
    // Replacement secret (sealed) awaiting confirmation; the current secret stays valid until then.
    pendingTotpSecret: text('pending_totp_secret'),
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
    // Last successful security reauthentication (passkey, password + TOTP, or recovery sign-in).
    reauthenticatedAt: timestamp('reauthenticated_at', { withTimezone: true }),
    reauthFailures: integer('reauth_failures').notNull().default(0),
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

const bytea = customType<{ data: Uint8Array<ArrayBuffer>; driverData: Buffer }>({
  dataType: () => 'bytea',
  toDriver: (value) => Buffer.from(value),
  fromDriver: (value) => new Uint8Array(value),
})

// WebAuthn credentials (verified by @simplewebauthn/server); public keys only, never secrets.
export const platformAdminPasskeys = pgTable(
  'platform_admin_passkeys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminId: uuid('admin_id')
      .notNull()
      .references(() => platformAdmins.id, { onDelete: 'cascade' }),
    credentialId: text('credential_id').notNull(),
    publicKey: bytea('public_key').notNull(),
    counter: bigint('counter', { mode: 'number' }).notNull().default(0),
    transports: text('transports')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    deviceType: text('device_type').notNull(),
    backedUp: boolean('backed_up').notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('platform_admin_passkeys_credential_unique').on(t.credentialId),
    index('platform_admin_passkeys_admin_idx').on(t.adminId),
    check('platform_admin_passkeys_name_present', sql`btrim(${t.name}) <> ''`),
    check('platform_admin_passkeys_counter', sql`${t.counter} >= 0`),
    pgPolicy('platform_admin_passkeys_admin_only', {
      for: 'all',
      using: adminOnly,
      withCheck: adminOnly,
    }),
  ],
).enableRLS()

// Single-use WebAuthn challenges, bound to a purpose and (except login) to an admin session.
export const platformAdminWebauthnChallenges = pgTable(
  'platform_admin_webauthn_challenges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    purpose: text('purpose', { enum: ['login', 'reauth', 'register'] }).notNull(),
    adminId: uuid('admin_id').references(() => platformAdmins.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').references(() => platformAdminSessions.id, {
      onDelete: 'cascade',
    }),
    challenge: text('challenge').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (t) => [
    index('platform_admin_webauthn_challenges_expiry_idx').on(t.expiresAt),
    check(
      'platform_admin_webauthn_challenges_binding',
      sql`(${t.purpose} = 'login' and ${t.adminId} is null and ${t.sessionId} is null) or (${t.purpose} <> 'login' and ${t.adminId} is not null and ${t.sessionId} is not null)`,
    ),
    pgPolicy('platform_admin_webauthn_challenges_admin_only', {
      for: 'all',
      using: adminOnly,
      withCheck: adminOnly,
    }),
  ],
).enableRLS()

// Recovery codes: keyed HMAC-SHA-256 digests only; a code is consumed by setting used_at.
export const platformAdminRecoveryCodes = pgTable(
  'platform_admin_recovery_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminId: uuid('admin_id')
      .notNull()
      .references(() => platformAdmins.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('platform_admin_recovery_codes_hash_unique').on(t.codeHash),
    index('platform_admin_recovery_codes_admin_idx').on(t.adminId),
    pgPolicy('platform_admin_recovery_codes_admin_only', {
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
