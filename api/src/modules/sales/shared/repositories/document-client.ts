import { sql, type SQLWrapper } from 'drizzle-orm'

import { clients } from '../../../../../db/schema/clients.js'

export function snapshotClientName(value: unknown) {
  const row = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return (
    [row.legalName, row.tradeName].find(
      (name): name is string => typeof name === 'string' && !!name,
    ) ?? [row.firstName, row.lastName].filter((name) => typeof name === 'string').join(' ')
  )
}

export function documentClientNameSql(snapshot: SQLWrapper) {
  return sql<string>`coalesce(${clients.legalName}, nullif(concat_ws(' ',${clients.firstName},${clients.lastName}),''), ${snapshot}->>'legalName', ${snapshot}->>'tradeName', nullif(concat_ws(' ',${snapshot}->>'firstName',${snapshot}->>'lastName'),''), 'Deleted client')`
}
