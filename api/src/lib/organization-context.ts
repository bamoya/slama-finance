import { sql } from 'drizzle-orm'

import type { Database, Transaction } from './db.js'

// Internal context, not an HTTP DTO. Construct only after authentication and tenant authorization.
export type OrganizationActor = { type: 'owner'; id: string } | { type: 'staff'; id: string }

export type AuthorizedOrganizationContext = Readonly<{
  organizationId: string
  actor: Readonly<OrganizationActor>
}>

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Installs context only for this transaction. This is plumbing, not authorization:
 * callers must verify ownership/staff scope and organization eligibility first.
 * All tenant queries must use the supplied tx, never the outer pooled db.
 */
export function withOrganizationTransaction<T>(
  db: Database,
  context: AuthorizedOrganizationContext,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  if (
    !uuid.test(context.organizationId) ||
    !uuid.test(context.actor.id) ||
    !['owner', 'staff'].includes(context.actor.type)
  ) {
    throw new Error('Invalid authorized organization context')
  }
  // Capture primitives before asynchronous work; callers cannot mutate the active scope.
  const { organizationId } = context
  const { type, id } = context.actor
  return db.transaction(async (tx) => {
    await tx.execute(sql`select
      set_config('app.organization_id', ${organizationId}, true),
      set_config('app.actor_type', ${type}, true),
      set_config('app.actor_id', ${id}, true)`)
    return work(tx)
  })
}
