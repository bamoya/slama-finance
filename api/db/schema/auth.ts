import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { actors } from './actors.js'
import { organizationColumn, tenantPolicy } from './tenant.js'

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: organizationColumn(),
    email: varchar('email', { length: 320 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    mustChangePassword: boolean('must_change_password').notNull().default(true),
    temporaryPasswordExpiresAt: timestamp('temporary_password_expires_at', { withTimezone: true }),
    temporaryPasswordConsumedAt: timestamp('temporary_password_consumed_at', {
      withTimezone: true,
    }),
    passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
    firstName: varchar('first_name', { length: 100 }),
    lastName: varchar('last_name', { length: 100 }),
    avatarUrl: text('avatar_url'),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    tenantPolicy(table.organizationId),
    uniqueIndex('users_organization_email_unique').on(table.organizationId, table.email),
    uniqueIndex('users_organization_id_unique').on(table.organizationId, table.id),
  ],
).enableRLS()

export const userSettings = pgTable(
  'user_settings',
  {
    organizationId: organizationColumn(),
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    locale: varchar('locale', { length: 12 }).notNull().default('fr'),
    timezone: varchar('timezone', { length: 64 }).notNull().default('Africa/Casablanca'),
    theme: varchar('theme', { length: 12 }).notNull().default('system'),
    ...timestamps,
  },
  (t) => [tenantPolicy(t.organizationId)],
).enableRLS()

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    organizationId: organizationColumn(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    purpose: varchar('purpose', { length: 24, enum: ['full', 'password_change'] })
      .notNull()
      .default('full'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    tenantPolicy(table.organizationId),
    foreignKey({
      name: 'sessions_organization_user_fk',
      columns: [table.organizationId, table.userId],
      foreignColumns: [users.organizationId, users.id],
    }).onDelete('cascade'),
    uniqueIndex('sessions_token_hash_unique').on(table.tokenHash),
    index('sessions_user_id_idx').on(table.organizationId, table.userId),
    check('sessions_purpose_check', sql`${table.purpose} IN ('full', 'password_change')`),
  ],
).enableRLS()

export const roles = pgTable(
  'roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: organizationColumn(),
    key: varchar('key', { length: 80 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description'),
    isSystem: boolean('is_system').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    tenantPolicy(table.organizationId),
    uniqueIndex('roles_organization_key_unique').on(table.organizationId, table.key),
    uniqueIndex('roles_organization_id_unique').on(table.organizationId, table.id),
  ],
).enableRLS()
export const permissions = pgTable(
  'permissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: varchar('key', { length: 120 }).notNull(),
    description: text('description'),
    ...timestamps,
  },
  (table) => [uniqueIndex('permissions_key_unique').on(table.key)],
)
export const rolePermissions = pgTable(
  'role_permissions',
  {
    organizationId: organizationColumn(),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (table) => [
    tenantPolicy(table.organizationId),
    primaryKey({ columns: [table.roleId, table.permissionId] }),
  ],
).enableRLS()
export const userRoles = pgTable(
  'user_roles',
  {
    organizationId: organizationColumn(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    assignedByActorId: uuid('assigned_by_actor_id').references(() => actors.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    tenantPolicy(table.organizationId),
    primaryKey({ columns: [table.userId, table.roleId] }),
    index('user_roles_role_id_idx').on(table.organizationId, table.roleId),
  ],
).enableRLS()

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    organizationId: organizationColumn(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    email: varchar('email', { length: 320 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    tenantPolicy(table.organizationId),
    uniqueIndex('password_reset_tokens_tokenHash_tenant_unique').on(
      table.organizationId,
      table.tokenHash,
    ),
    index('password_reset_tokens_user_id_idx').on(table.organizationId, table.userId),
    foreignKey({
      name: 'password_reset_organization_user_fk',
      columns: [table.organizationId, table.userId],
      foreignColumns: [users.organizationId, users.id],
    }).onDelete('cascade'),
  ],
).enableRLS()

export const authSchemaSql = sql`select 1`
