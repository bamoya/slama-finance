import { sql } from 'drizzle-orm'
import { check, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

import { roles, users } from './auth.js'
import { organizationColumn, tenantPolicy } from './tenant.js'

export const staffInvitations = pgTable(
  'staff_invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: organizationColumn(),
    email: text('email').notNull(),
    language: text('language', { enum: ['fr', 'en'] })
      .notNull()
      .default('fr'),
    invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
    acceptedUserId: uuid('accepted_user_id').references(() => users.id, { onDelete: 'set null' }),
    status: text('status', { enum: ['pending', 'accepted', 'revoked'] })
      .notNull()
      .default('pending'),
    tokenHash: text('token_hash'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    deliveryState: text('delivery_state', {
      enum: ['queued', 'sending', 'sent', 'failed', 'cancelled'],
    })
      .notNull()
      .default('queued'),
    attempts: integer('attempts').notNull().default(0),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
    leaseId: uuid('lease_id'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    tenantPolicy(t.organizationId),
    uniqueIndex('staff_invitation_pending_email')
      .on(t.organizationId, t.email)
      .where(sql`${t.status}='pending'`),
    uniqueIndex('staff_invitation_token_hash').on(t.organizationId, t.tokenHash),
    check('staff_invitation_email_normalized', sql`${t.email}=lower(trim(${t.email}))`),
    check('staff_invitation_status', sql`${t.status} in ('pending','accepted','revoked')`),
    check('staff_invitation_language', sql`${t.language} in ('fr','en')`),
    check(
      'staff_invitation_delivery_state',
      sql`${t.deliveryState} in ('queued','sending','sent','failed','cancelled')`,
    ),
    check('staff_invitation_attempts', sql`${t.attempts} between 0 and 5`),
  ],
).enableRLS()

// Keep a null role reference after deletion so acceptance detects a missing required role.
export const staffInvitationRoles = pgTable(
  'staff_invitation_roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: organizationColumn(),
    invitationId: uuid('invitation_id')
      .notNull()
      .references(() => staffInvitations.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id').references(() => roles.id, { onDelete: 'set null' }),
  },
  (t) => [
    tenantPolicy(t.organizationId),
    uniqueIndex('staff_invitation_role_unique').on(t.invitationId, t.roleId),
  ],
).enableRLS()
