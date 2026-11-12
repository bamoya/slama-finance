import { sql } from 'drizzle-orm'

import { documentNumberCounters } from '../../../../../../db/schema/document-counters.js'
import type { Transaction } from '../../../../../lib/db.js'

export type DocumentSeries = (typeof documentNumberCounters.$inferInsert)['series']

/**
 * Next gap-free number of an organization series, `PREFIX-YYYY-NNNNNN` (six digits, growing beyond).
 * Must run inside the business transaction: the counter row stays locked until commit, so a
 * rollback releases the number and concurrent issuers are serialized. A per-series advisory lock is
 * taken first so the year and the issue instant are read only after the previous issuer committed:
 * numbers follow issue instants, and the year always matches the instant (company timezone). Year and instant come from the same
 * `statement_timestamp()`, read by this statement after the lock, so they can never straddle a year boundary.
 */
export async function nextDocumentNumber(
  tx: Transaction,
  series: DocumentSeries,
  timezone: string,
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(coalesce(current_setting('app.organization_id', true), '') || ':' || ${series}::text, 0))`,
  )
  const [row] = await tx
    .insert(documentNumberCounters)
    .values({
      series,
      year: sql`extract(year from statement_timestamp() at time zone ${timezone})::int`,
      last: 1,
    })
    .onConflictDoUpdate({
      target: [
        documentNumberCounters.organizationId,
        documentNumberCounters.series,
        documentNumberCounters.year,
      ],
      set: { last: sql`${documentNumberCounters.last}+1` },
    })
    .returning({
      last: documentNumberCounters.last,
      year: documentNumberCounters.year,
      issuedAt: sql<string>`statement_timestamp()`,
    })
  return {
    number: `${series}-${row!.year}-${String(row!.last).padStart(6, '0')}`,
    issuedAt: new Date(row!.issuedAt),
  }
}
