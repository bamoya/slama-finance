import type {
  AdminCreditNoteRequest,
  AdminInvoicePage,
  AdminPayment,
  AdminPaymentConfirmation,
  AdminPaymentPage,
  AdminPaymentRejection,
} from '../../../../../contracts/generated/administration/administration.schemas.js'
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
) {
  async function payment(id: string) {
    const row = await withAdmin((tx) => repo.payment(id, tx))
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Payment not found.')
    return toAdminPayment(row)
  }
  const audited =
    (admin: AuthenticatedAdmin, action: string, auditReason: string): PaymentDecision =>
    (tx, before, after, receipt, creditNote) =>
      audit.record(
        {
          adminId: admin.id,
          actor: admin.email,
          action: receipt ? 'payment.receipt' : action,
          targetType: 'subscription_payment',
          targetId: after.id,
          before: paymentDecisionSnapshot(before),
          after: {
            ...paymentDecisionSnapshot(after),
            ...(receipt ? { receipt } : {}),
            ...(creditNote ? { creditNote } : {}),
            auditReason,
          },
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
        await billing.confirm(
          id,
          admin.email,
          {
            reference: input.receivedReference?.trim() || undefined,
            amountTtc: input.receivedAmountTtc,
            receivedAt: input.receivedAt ? new Date(input.receivedAt) : undefined,
          },
          audited(admin, 'payment.confirm', auditReason),
          tx,
        )
      })
      return payment(id)
    },
    /** Reads the snapshot in its own short transaction and renders after it ends (no held connection). */
    invoicePdf: (invoiceId: string, language: 'fr' | 'en') =>
      billing.invoicePdf(invoiceId, language),
    async invoices(ownerId: string | undefined, page: number): Promise<AdminInvoicePage> {
      const { rows, total } = await withAdmin((tx) =>
        billing.invoices({ ownerId, page, pageSize: PAGE_SIZE }, tx),
      )
      return { items: rows, page, pageSize: PAGE_SIZE, total }
    },
    /** Explicit correction, audited in the same transaction. */
    async creditNote(admin: AuthenticatedAdmin, invoiceId: string, input: AdminCreditNoteRequest) {
      const auditReason = input.auditReason.trim()
      if (!auditReason)
        throw new AppError(400, 'AUDIT_REASON_REQUIRED', 'Give an internal audit reason.')
      return withAdmin((tx) =>
        billing.creditNote(
          invoiceId,
          { amountHt: input.amountHt, reason: input.reason },
          admin.email,
          (t, note) =>
            audit.record(
              {
                adminId: admin.id,
                actor: admin.email,
                action: 'invoice.credit_note',
                targetType: 'billing_invoice',
                targetId: invoiceId,
                before: null,
                after: {
                  creditNote: note.invoice.number,
                  amountTtc: note.invoice.totals.amountTtc,
                  reason: note.invoice.reason,
                  auditReason,
                },
              },
              t,
            ),
          tx,
        ),
      )
    },
    async reject(admin: AuthenticatedAdmin, id: string, input: AdminPaymentRejection) {
      const auditReason = input.auditReason.trim()
      if (!auditReason)
        throw new AppError(400, 'AUDIT_REASON_REQUIRED', 'Give an internal audit reason.')
      await withAdmin(async (tx) => {
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
