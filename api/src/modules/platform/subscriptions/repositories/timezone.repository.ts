import { sql } from 'drizzle-orm'

import type { Database } from '../../../../lib/db.js'

/** Database zone data, read only to verify it agrees with the application's (never for math). */
export function createTimezoneRepository(database: () => Database) {
  return {
    async offsets(instants: Date[], timezone: string) {
      const rows = await database().execute(
        sql`select (extract(epoch from (t at time zone ${timezone}) - (t at time zone 'UTC')) * 1000)::bigint::text as offset_ms from unnest(${`{${instants.map((i) => i.toISOString()).join(',')}}`}::timestamptz[]) with ordinality as x(t, n) order by n`,
      )
      return rows.map((row) => Number(row.offset_ms))
    },
  }
}
