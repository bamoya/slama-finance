import { eq, sql } from 'drizzle-orm'

import { auditEvents, companySettings } from '../../../../../db/schema/settings.js'
import type { Database, Transaction } from '../../../../lib/db.js'
export function createAnalysisRepository(database: () => Database, clock?: () => Date) {
  return {
    snapshot: <T>(work: (tx: Transaction) => Promise<T>) =>
      database().transaction(work, { isolationLevel: 'repeatable read' }),
    async context(tx: Transaction) {
      const [row] = await tx
        .select({ timezone: companySettings.timezone, companyName: companySettings.legalName })
        .from(companySettings)
        .where(eq(companySettings.id, 1))
      const time = await tx.execute(sql`select transaction_timestamp() as captured_at`)
      return {
        timezone: row?.timezone ?? 'Africa/Casablanca',
        companyName: row?.companyName ?? 'Company',
        capturedAt: clock?.() ?? new Date(String(time[0]!.captured_at)),
      }
    },
    audit(actor: string, criteria: unknown, format: string, capturedAt: string, outcome: string) {
      return database().insert(auditEvents).values({
        actorUserId: actor,
        actorKind: 'user',
        action: 'export',
        entityTable: 'reports',
        entityKey: { format },
        afterValues: { criteria, format, capturedAt, outcome },
      })
    },
  }
}
