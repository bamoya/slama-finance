import { and, count, desc, eq } from 'drizzle-orm'

import { platformAdminAudit } from '../../../../../../db/schema/administration.js'
import type { Transaction } from '../../../../../lib/db.js'

export type AuditInput = Omit<typeof platformAdminAudit.$inferInsert, 'id' | 'createdAt'>

export function createAuditRepository() {
  return {
    async append(entry: AuditInput, tx: Transaction) {
      await tx.insert(platformAdminAudit).values(entry)
    },
    async latest(action: string, targetType: string, targetId: string, tx: Transaction) {
      const [row] = await tx
        .select()
        .from(platformAdminAudit)
        .where(
          and(
            eq(platformAdminAudit.action, action),
            eq(platformAdminAudit.targetType, targetType),
            eq(platformAdminAudit.targetId, targetId),
          ),
        )
        .orderBy(desc(platformAdminAudit.createdAt), desc(platformAdminAudit.id))
        .limit(1)
      return row
    },
    async page(page: number, pageSize: number, tx: Transaction) {
      const [rows, [total]] = await Promise.all([
        tx
          .select()
          .from(platformAdminAudit)
          .orderBy(desc(platformAdminAudit.createdAt), desc(platformAdminAudit.id))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        tx.select({ n: count() }).from(platformAdminAudit),
      ])
      return { rows, total: total?.n ?? 0 }
    },
  }
}
