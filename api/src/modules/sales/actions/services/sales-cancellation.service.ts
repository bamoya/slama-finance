import type {
  ConfirmSalesCancellation,
  SalesCancellationSelection,
} from '../../../../contracts/generated/sales/cancellation.schemas.js'
import type { Transaction } from '../../../../lib/db.js'
import { AppError } from '../../../../lib/errors.js'
import { createImpactConfirmation } from '../../../../lib/impact-confirmation.js'
import { assertVersion } from '../../../../lib/validation.js'
import type { createDeliveryNoteRepository } from '../../delivery-notes/repositories/delivery-note.repository.js'
import type { createEstimateRepository } from '../../estimates/repositories/estimate.repository.js'
import type { createInvoiceRepository } from '../../invoices/repositories/invoice.repository.js'
import type { createPaymentRepository } from '../../payments/repositories/payment.repository.js'

export function createSalesCancellationService(
  invoices: ReturnType<typeof createInvoiceRepository>,
  estimates: ReturnType<typeof createEstimateRepository>,
  deliveries: ReturnType<typeof createDeliveryNoteRepository>,
  payments: ReturnType<typeof createPaymentRepository>,
  invalidate: (tx: Transaction) => Promise<void>,
) {
  const confirmation = createImpactConfirmation()
  async function graph(input: SalesCancellationSelection, actor: string, tx: Transaction) {
    for (const action of ['read', 'update'])
      await invoices.authorize(tx, actor, `${input.resource}.${action}`)
    const records = [...input.records]
      .map((row) => ({ ...row, id: row.id.toLowerCase() }))
      .sort((a, b) => a.id.localeCompare(b.id))
    if (new Set(records.map((row) => row.id)).size !== records.length)
      throw new AppError(400, 'DUPLICATE_SELECTION', 'Select each record only once.')
    const roots = []
    for (const record of records) {
      const row =
        input.resource === 'estimates'
          ? await estimates.one(record.id, tx, true)
          : input.resource === 'delivery_notes'
            ? await deliveries.one(record.id, tx, true)
            : await payments.one(record.id, tx, true)
      assertVersion(row.version, record.expectedVersion)
      const eligible =
        input.resource === 'estimates'
          ? ['issued', 'sent', 'accepted', 'rejected', 'expired'].includes(row.status)
          : input.resource === 'delivery_notes'
            ? row.status === 'delivered'
            : row.status !== 'cancelled'
      if (!eligible)
        throw new AppError(
          409,
          'INVALID_STATUS',
          'Every selected record must be eligible for cancellation.',
        )
      roots.push(row)
    }
    return { actor, resource: input.resource, roots }
  }
  return {
    preview(input: SalesCancellationSelection, actor: string) {
      return invoices.transaction(async (tx) => {
        const state = await graph(input, actor, tx)
        return {
          ...confirmation.issue(state),
          resource: input.resource,
          records: state.roots.map((row) => ({
            id: row.id,
            name: row.number,
            status: row.status,
            version: row.version,
          })),
          receipts: state.roots.filter((row) => 'receiptIssuedAt' in row && row.receiptIssuedAt)
            .length,
        }
      })
    },
    confirm(input: ConfirmSalesCancellation, actor: string) {
      return invoices.transaction(async (tx) => {
        const state = await graph(input, actor, tx)
        confirmation.assert(input.token, state)
        const reason = input.reason.trim()
        if (!reason)
          throw new AppError(400, 'CANCELLATION_REASON_REQUIRED', 'Enter a cancellation reason.')
        for (const before of state.roots) {
          if (input.resource === 'estimates' && 'validUntil' in before) {
            const after = await estimates.update(
              before.id,
              {
                status: 'cancelled',
                cancelledAt: new Date(),
                cancellationReason: reason,
                updatedByUserId: actor,
              },
              tx,
            )
            await estimates.audit(tx, actor, 'cancelled', before.id, before, after)
          } else if (input.resource === 'delivery_notes' && 'deliveryDate' in before) {
            const after = await deliveries.update(
              before.id,
              { status: 'cancelled', cancellationReason: reason, updatedByUserId: actor },
              tx,
              true,
            )
            await deliveries.audit(tx, actor, 'cancel', before.id, before, after)
          } else if (input.resource === 'payments' && 'amount' in before) {
            const after = await payments.update(
              before.id,
              {
                status: 'cancelled',
                cancelledAt: new Date(),
                cancellationReason: reason,
                updatedByUserId: actor,
              },
              tx,
            )
            await payments.audit(tx, actor, 'cancel', before.id, before, after, reason)
          }
        }
        await invalidate(tx)
      })
    },
  }
}
