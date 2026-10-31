import type { AdminAuditPage } from '../../../../../contracts/generated/administration/administration.schemas.js'
import type { Transaction } from '../../../../../lib/db.js'
import type { AdminTransaction } from '../../shared/repositories/admin-transaction.repository.js'
import type { AuditInput, createAuditRepository } from '../repositories/audit.repository.js'

const AUDIT_PAGE_SIZE = 50

/** Append-only audit trail shared by every administration domain. */
export function createAdminAuditService(
  repo: ReturnType<typeof createAuditRepository>,
  admin: AdminTransaction,
) {
  return {
    record: (entry: AuditInput, tx: Transaction) => repo.append(entry, tx),
    /** Internal reason of the latest matching action; administrators only. */
    async reason(action: string, targetType: string, targetId: string, tx: Transaction) {
      const row = await repo.latest(action, targetType, targetId, tx)
      const after = row?.after as { reason?: unknown } | null | undefined
      return typeof after?.reason === 'string' ? after.reason : null
    },
    async list(page: number): Promise<AdminAuditPage> {
      const { rows, total } = await admin((tx) => repo.page(page, AUDIT_PAGE_SIZE, tx))
      return {
        items: rows.map((r) => ({
          id: r.id,
          adminId: r.adminId,
          actor: r.actor,
          action: r.action,
          targetType: r.targetType,
          targetId: r.targetId,
          before: (r.before as Record<string, unknown> | null) ?? null,
          after: (r.after as Record<string, unknown> | null) ?? null,
          createdAt: r.createdAt.toISOString(),
        })),
        page,
        pageSize: AUDIT_PAGE_SIZE,
        total,
      }
    },
  }
}

export type AdminAuditService = ReturnType<typeof createAdminAuditService>
