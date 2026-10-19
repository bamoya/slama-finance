import { asc, inArray } from 'drizzle-orm'

import { deliveryNotes } from '../../../../../db/schema/delivery-notes.js'
import { payments } from '../../../../../db/schema/payments.js'
import type { Transaction } from '../../../../lib/db.js'

export function createCancellationRepository() {
  return {
    payments(tx: Transaction, invoiceIds: string[]) {
      return tx
        .select()
        .from(payments)
        .where(inArray(payments.invoiceId, invoiceIds))
        .orderBy(asc(payments.id))
        .for('update')
    },
    deliveries(tx: Transaction, noteIds: string[]) {
      if (!noteIds.length) return Promise.resolve([])
      return tx
        .select()
        .from(deliveryNotes)
        .where(inArray(deliveryNotes.id, noteIds))
        .orderBy(asc(deliveryNotes.id))
        .for('update')
    },
  }
}
