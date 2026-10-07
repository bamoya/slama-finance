import { sql } from 'drizzle-orm'
import { z } from 'zod'

import type { Transaction } from '../../lib/db.js'

// Add policies explicitly with each domain; unknown fields are never copied through.
const policies = {
  users: ['email', 'firstName', 'lastName', 'disabledAt', 'mustChangePassword'],
  user_settings: ['locale', 'timezone', 'theme'],
  roles: ['key', 'name', 'description', 'isSystem'],
  permissions: ['key', 'description'],
  user_roles: ['userId', 'roleId', 'assignedByUserId'],
  role_permissions: ['roleId', 'permissionId'],
} as const

type Entity = keyof typeof policies
const scalar = z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()])
const inputSchema = z
  .object({
    actorUserId: z.string().uuid().nullable(),
    actorKind: z.enum(['user', 'system', 'bootstrap']),
    action: z.enum([
      'create',
      'update',
      'disable',
      'enable',
      'grant',
      'revoke',
      'password_reset',
      'password_change',
      'delete',
    ]),
    entityTable: z.enum([
      'users',
      'user_settings',
      'roles',
      'permissions',
      'user_roles',
      'role_permissions',
    ]),
    entityKey: z.record(z.string().uuid()),
    beforeValues: z.record(z.unknown()).optional(),
    afterValues: z.record(z.unknown()).optional(),
    reason: z.string().max(500).optional(),
    requestId: z.string().uuid().optional(),
    ipAddress: z.string().ip().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.actorKind === 'user' && !value.actorUserId)
      ctx.addIssue({ code: 'custom', path: ['actorUserId'], message: 'User actor is required' })
    const expected =
      value.entityTable === 'user_roles'
        ? ['userId', 'roleId']
        : value.entityTable === 'role_permissions'
          ? ['roleId', 'permissionId']
          : value.entityTable === 'user_settings'
            ? ['userId']
            : ['id']
    if (
      Object.keys(value.entityKey).length !== expected.length ||
      expected.some((key) => !value.entityKey[key])
    )
      ctx.addIssue({
        code: 'custom',
        path: ['entityKey'],
        message: 'Complete entity key is required',
      })
  })

export type AuditInput = z.input<typeof inputSchema>

function safeValues(entity: Entity, values: Record<string, unknown> | undefined) {
  if (!values) return null
  const result: Record<string, z.infer<typeof scalar>> = {}
  for (const key of policies[entity]) {
    if (Object.hasOwn(values, key)) result[key] = scalar.parse(values[key])
  }
  return result
}

export function prepareAuditEvent(input: AuditInput) {
  const event = inputSchema.parse(input)
  return {
    ...event,
    beforeValues: safeValues(event.entityTable, event.beforeValues),
    afterValues: safeValues(event.entityTable, event.afterValues),
  }
}

// Intentionally accepts a transaction, not a database/global connection.
// Production audit_events DDL and grants are introduced with the users baseline in 01.
export async function writeAudit(tx: Transaction, input: AuditInput) {
  const event = prepareAuditEvent(input)
  await tx.execute(sql`
    insert into audit_events
      (actor_user_id, actor_kind, action, entity_table, entity_key,
       before_values, after_values, reason, request_id, ip_address)
    values (${event.actorUserId}, ${event.actorKind}, ${event.action}, ${event.entityTable},
      ${JSON.stringify(event.entityKey)}::jsonb,
      ${event.beforeValues === null ? null : JSON.stringify(event.beforeValues)}::jsonb,
      ${event.afterValues === null ? null : JSON.stringify(event.afterValues)}::jsonb,
      ${event.reason ?? null}, ${event.requestId ?? null}, ${event.ipAddress ?? null})
  `)
}
