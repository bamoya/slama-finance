import type {
  ConfirmInvoiceCancellation,
  InvoiceCancellationSelection,
} from '../../../../contracts/generated/sales/actions.schemas.js'
import type { Transaction } from '../../../../lib/db.js'
import { AppError } from '../../../../lib/errors.js'
import { createImpactConfirmation } from '../../../../lib/impact-confirmation.js'
import { assertVersion } from '../../../../lib/validation.js'
import type { createDeliveryNoteRepository } from '../../delivery-notes/repositories/delivery-note.repository.js'
import type { createInvoiceRepository } from '../../invoices/repositories/invoice.repository.js'
import type { createPaymentRepository } from '../../payments/repositories/payment.repository.js'
import { createCancellationRepository } from '../repositories/cancellation.repository.js'

export function createInvoiceCancellationService(
  invoices: ReturnType<typeof createInvoiceRepository>,
  payments: ReturnType<typeof createPaymentRepository>,
  deliveries: ReturnType<typeof createDeliveryNoteRepository>,
  invalidate: (tx: Transaction) => Promise<void>,
) {
  const repo = createCancellationRepository()
  const confirmation = createImpactConfirmation()
  async function graph(input: InvoiceCancellationSelection, actor: string, tx: Transaction) {
    await invoices.authorize(tx, actor, 'invoices.update')
    await invoices.authorize(tx, actor, 'invoices.read')
    const selection = input.invoices
      .map((item) => ({ ...item, id: item.id.toLowerCase() }))
      .sort((a, b) => a.id.localeCompare(b.id))
    if (new Set(selection.map((item) => item.id)).size !== selection.length)
      throw new AppError(400, 'DUPLICATE_SELECTION', 'Select each invoice only once.')
    const roots = []
    const noteIds = new Set<string>()
    for (const item of selection) {
      const row = await invoices.one(item.id, tx, true)
      assertVersion(row.version, item.expectedVersion)
      if (!['issued', 'sent'].includes(row.status))
        throw new AppError(409, 'INVALID_STATUS', 'Every selected invoice must be issued.')
      roots.push(row)
      for (const id of await invoices.relatedDeliveryNoteIds(row.id, tx)) noteIds.add(id)
    }
    const notes = await repo.deliveries(tx, [...noteIds].sort())
    const records = await repo.payments(
      tx,
      roots.map((row) => row.id),
    )
    if (notes.length) await deliveries.authorize(tx, actor, 'delivery_notes.read')
    if (records.length) await payments.authorize(tx, actor, 'payments.read')
    if (notes.some((row) => row.status !== 'cancelled'))
      await deliveries.authorize(tx, actor, 'delivery_notes.update')
    if (records.some((row) => row.status !== 'cancelled'))
      await payments.authorize(tx, actor, 'payments.update')
    return { actor, action: 'cancel_invoices', roots, notes, records }
  }
  const item = (row: { id: string; number: string | null; status: string; version: number }) => ({
    id: row.id,
    name: row.number,
    status: row.status,
    version: row.version,
  })
  return {
    preview(input: InvoiceCancellationSelection, actor: string) {
      return invoices.transaction(async (tx) => {
        const state = await graph(input, actor, tx)
        return {
          ...confirmation.issue(state),
          invoices: state.roots.map(item),
          payments: state.records.filter((row) => row.status !== 'cancelled').map(item),
          deliveryNotes: state.notes.filter((row) => row.status !== 'cancelled').map(item),
          receipts: state.records.filter((row) => row.status !== 'cancelled' && row.receiptIssuedAt)
            .length,
          alreadyCancelled: [...state.notes, ...state.records].filter(
            (row) => row.status === 'cancelled',
          ).length,
        }
      })
    },
    confirm(input: ConfirmInvoiceCancellation, actor: string) {
      return invoices.transaction(async (tx) => {
        const state = await graph(input, actor, tx)
        confirmation.assert(input.token, state)
        const reason = input.reason.trim()
        if (!reason)
          throw new AppError(400, 'CANCELLATION_REASON_REQUIRED', 'Enter a cancellation reason.')
        for (const before of state.records) {
          if (before.status === 'cancelled') continue
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
        for (const before of state.notes) {
          if (before.status === 'cancelled') continue
          const after = await deliveries.update(
            before.id,
            {
              status: 'cancelled',
              cancellationReason: reason,
              updatedByUserId: actor,
            },
            tx,
            true,
          )
          await deliveries.audit(tx, actor, 'cancel', before.id, before, after)
        }
        for (const before of state.roots) {
          const after = await invoices.update(
            before.id,
            {
              status: 'cancelled',
              cancelledAt: new Date(),
              cancellationReason: reason,
              updatedByUserId: actor,
            },
            tx,
            true,
          )
          await invoices.audit(tx, actor, 'cancel', before.id, before, after)
        }
        await invalidate(tx)
      })
    },
  }
}
