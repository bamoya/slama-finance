import { eq, sql } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

import { currentOrganizationId } from './tenant-database.js'

/** Immutable factory scope. An absent scope matches unassigned rows only, never all organizations. */
export function staffOrganizationScope(column: AnyPgColumn, organizationId?: string) {
  const scope = organizationId ?? currentOrganizationId()
  return scope
    ? eq(column, scope)
    : eq(column, sql`nullif(current_setting('app.organization_id',true),'')::uuid`)
}
