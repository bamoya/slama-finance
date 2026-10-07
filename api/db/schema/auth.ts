import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
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
    ...timestamps,
  },
  (table) => [uniqueIndex('users_email_unique').on(table.email)],
)

export const userSettings = pgTable('user_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  locale: varchar('locale', { length: 12 }).notNull().default('fr'),
  timezone: varchar('timezone', { length: 64 }).notNull().default('Africa/Casablanca'),
  theme: varchar('theme', { length: 12 }).notNull().default('system'),
  ...timestamps,
})

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
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
    uniqueIndex('sessions_token_hash_unique').on(table.tokenHash),
    index('sessions_user_id_idx').on(table.userId),
    check('sessions_purpose_check', sql`${table.purpose} IN ('full', 'password_change')`),
  ],
)

export const roles = pgTable(
  'roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: varchar('key', { length: 80 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description'),
    isSystem: boolean('is_system').notNull().default(false),
    ...timestamps,
  },
  (table) => [uniqueIndex('roles_key_unique').on(table.key)],
)
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
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })],
)
export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    assignedByUserId: uuid('assigned_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.roleId] }),
    index('user_roles_role_id_idx').on(table.roleId),
  ],
)

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
    email: varchar('email', { length: 320 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('password_reset_tokens_user_id_idx').on(table.userId)],
)

export const authSchemaSql = sql`select 1`
