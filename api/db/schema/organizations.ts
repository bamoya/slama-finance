import { sql } from 'drizzle-orm'
import {
  check,
  index,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

const timestamps = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// Independent from organization staff identities in users. Never copy staff credentials here.
export const platformUsers = pgTable(
  'platform_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    firstName: text('first_name'),
    lastName: text('last_name'),
    locale: text('locale', { enum: ['fr', 'en'] })
      .notNull()
      .default('fr'),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    // Administrator restrictions; reasons live only in the administrator audit trail.
    blockedAt: timestamp('blocked_at', { withTimezone: true }),
    deletionRequestedAt: timestamp('deletion_requested_at', { withTimezone: true }),
    deletionDueAt: timestamp('deletion_due_at', { withTimezone: true }),
    // Set when an administrator created the account; pending until the owner sets a password.
    invitedAt: timestamp('invited_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('platform_users_email_unique').on(t.email),
    check(
      'platform_users_deletion_window',
      sql`(${t.deletionRequestedAt} is null and ${t.deletionDueAt} is null) or (${t.deletionRequestedAt} is not null and ${t.deletionDueAt} > ${t.deletionRequestedAt})`,
    ),
    check('platform_users_locale', sql`${t.locale} in ('fr', 'en')`),
    check(
      'platform_users_email_normalized',
      sql`${t.email} = lower(btrim(${t.email})) and ${t.email} <> ''`,
    ),
  ],
)

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => platformUsers.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    locale: text('locale', { enum: ['fr', 'en'] })
      .notNull()
      .default('fr'),
    // Independent markers preserve overlapping restrictions and the pre-deletion state.
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    pausedAt: timestamp('paused_at', { withTimezone: true }),
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    // Who suspended the organization; only that source may lift the suspension.
    suspensionSource: text('suspension_source', { enum: ['admin'] }),
    deletionRequestedAt: timestamp('deletion_requested_at', { withTimezone: true }),
    deletionDueAt: timestamp('deletion_due_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('organizations_slug_unique').on(t.slug),
    index('organizations_owner_idx').on(t.ownerId),
    // SaaS administration sees organization identity only; finance tables stay tenant-scoped.
    pgPolicy('organizations_platform_admin_read', {
      for: 'select',
      using: sql`current_setting('app.actor_type',true)='platform_admin'`,
    }),
    pgPolicy('organizations_platform_admin_update', {
      for: 'update',
      using: sql`current_setting('app.actor_type',true)='platform_admin'`,
      withCheck: sql`current_setting('app.actor_type',true)='platform_admin'`,
    }),
    pgPolicy('organizations_worker_discovery', {
      for: 'select',
      using: sql`current_setting('app.actor_type',true)='worker'`,
    }),
    pgPolicy('organizations_owner_portal_update', {
      for: 'update',
      using: sql`current_setting('app.actor_type',true)='owner' and ${t.ownerId}=nullif(current_setting('app.owner_id',true),'')::uuid`,
      withCheck: sql`current_setting('app.actor_type',true)='owner' and ${t.ownerId}=nullif(current_setting('app.owner_id',true),'')::uuid`,
    }),
    pgPolicy('organizations_owner_portal_insert', {
      for: 'insert',
      withCheck: sql`current_setting('app.actor_type',true)='owner' and ${t.ownerId}=nullif(current_setting('app.owner_id',true),'')::uuid`,
    }),
    pgPolicy('organizations_owner_portal_read', {
      for: 'select',
      using: sql`current_setting('app.actor_type', true) = 'owner' and ${t.ownerId} = nullif(current_setting('app.owner_id', true), '')::uuid`,
    }),
    pgPolicy('organizations_tenant_scope', {
      for: 'all',
      using: sql`${t.id} = nullif(current_setting('app.organization_id', true), '')::uuid`,
      withCheck: sql`${t.id} = nullif(current_setting('app.organization_id', true), '')::uuid`,
    }),
    check('organizations_name_present', sql`btrim(${t.name}) <> ''`),
    check(
      'organizations_slug_format',
      sql`char_length(${t.slug}) between 1 and 63 and ${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`,
    ),
    check('organizations_locale', sql`${t.locale} in ('fr', 'en')`),
    check(
      'organizations_suspension_source',
      sql`${t.suspensionSource} is null or ${t.suspendedAt} is not null`,
    ),
    check(
      'organizations_deletion_window',
      sql`(${t.deletionRequestedAt} is null and ${t.deletionDueAt} is null) or (${t.deletionRequestedAt} is not null and ${t.deletionDueAt} is not null and ${t.deletionDueAt} > ${t.deletionRequestedAt})`,
    ),
  ],
).enableRLS()

export const organizationDomains = pgTable(
  'organization_domains',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    hostname: text('hostname').notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('organization_domains_hostname_unique').on(t.hostname),
    index('organization_domains_organization_idx').on(t.organizationId),
    uniqueIndex('organization_domains_active_unique')
      .on(t.organizationId)
      .where(sql`${t.activatedAt} is not null`),
    pgPolicy('organization_domains_tenant_scope', {
      for: 'all',
      using: sql`${t.organizationId} = nullif(current_setting('app.organization_id', true), '')::uuid`,
      withCheck: sql`${t.organizationId} = nullif(current_setting('app.organization_id', true), '')::uuid`,
    }),
    check(
      'organization_domains_hostname_format',
      sql`char_length(${t.hostname}) between 3 and 253 and ${t.hostname} = lower(${t.hostname}) and ${t.hostname} ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?[.])+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'`,
    ),
    check(
      'organization_domains_activation_verified',
      sql`${t.activatedAt} is null or ${t.verifiedAt} is not null`,
    ),
  ],
).enableRLS()

export const ownerSessions = pgTable(
  'owner_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => platformUsers.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('owner_sessions_token_unique').on(t.tokenHash),
    index('owner_sessions_owner_idx').on(t.ownerId),
  ],
)

export const ownerAccountTokens = pgTable(
  'owner_account_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => platformUsers.id, { onDelete: 'cascade' }),
    purpose: text('purpose', { enum: ['verify_email', 'reset_password', 'invitation'] }).notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('owner_account_tokens_hash_unique').on(t.tokenHash),
    index('owner_account_tokens_owner_idx').on(t.ownerId),
    check(
      'owner_account_tokens_purpose',
      sql`${t.purpose} in ('verify_email', 'reset_password', 'invitation')`,
    ),
  ],
)
