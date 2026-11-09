import type {
  AdminPayment,
  AdminPaymentConfirmation,
  AdminPaymentPage,
  AdminPaymentRejection,
} from '../../../../../contracts/generated/administration/administration.schemas.js'
import type { Transaction } from '../../../../../lib/db.js'
import { AppError } from '../../../../../lib/errors.js'
import type { AdminAuditService } from '../../audit/services/admin-audit.service.js'
import type { AdminTransaction } from '../../shared/repositories/admin-transaction.repository.js'
import type { AuthenticatedAdmin } from '../../shared/types/authenticated-admin.js'
import type { createAdminPaymentRepository } from '../repositories/admin-payment.repository.js'
import type { AdminBillingPort, PaymentDecision } from './admin-billing.port.js'
import { paymentDecisionSnapshot, toAdminPayment } from './admin-payment-view.js'

const PAGE_SIZE = 20

export function createAdminPaymentsService(
  repo: ReturnType<typeof createAdminPaymentRepository>,
  audit: AdminAuditService,
  withAdmin: AdminTransaction,
  billing: AdminBillingPort,
  stepUp: (admin: AuthenticatedAdmin, code: string, tx: Transaction) => Promise<void>,
) {
  async function payment(id: string) {
    const row = await withAdmin((tx) => repo.payment(id, tx))
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Payment not found.')
    return toAdminPayment(row)
  }
  const audited =
    (admin: AuthenticatedAdmin, action: string, auditReason: string): PaymentDecision =>
    (tx, before, after) =>
      audit.record(
        {
          adminId: admin.id,
          actor: admin.email,
          action,
          targetType: 'subscription_payment',
          targetId: after.id,
          before: paymentDecisionSnapshot(before),
          after: { ...paymentDecisionSnapshot(after), auditReason },
        },
        tx,
      )

  return {
    async list(
      status: AdminPayment['status'] | undefined,
      page: number,
    ): Promise<AdminPaymentPage> {
      const { rows, total } = await withAdmin((tx) => repo.payments(status, page, PAGE_SIZE, tx))
      return { items: rows.map(toAdminPayment), page, pageSize: PAGE_SIZE, total }
    },
    /** Idempotent: an already-confirmed payment returns unchanged with no new audit row. */
    async confirm(admin: AuthenticatedAdmin, id: string, input: AdminPaymentConfirmation) {
      const auditReason = input.auditReason.trim()
      if (!auditReason)
        throw new AppError(400, 'AUDIT_REASON_REQUIRED', 'Give an internal audit reason.')
      await withAdmin(async (tx) => {
        await stepUp(admin, input.code, tx)
        await billing.confirm(
          id,
          admin.email,
          input.receivedReference?.trim() || undefined,
          audited(admin, 'payment.confirm', auditReason),
          tx,
        )
      })
      return payment(id)
    },
    async reject(admin: AuthenticatedAdmin, id: string, input: AdminPaymentRejection) {
      const auditReason = input.auditReason.trim()
      if (!auditReason)
        throw new AppError(400, 'AUDIT_REASON_REQUIRED', 'Give an internal audit reason.')
      await withAdmin(async (tx) => {
        await stepUp(admin, input.code, tx)
        await billing.reject(
          id,
          admin.email,
          input.reason,
          audited(admin, 'payment.reject', auditReason),
          tx,
        )
      })
      return payment(id)
    },
  }
}
