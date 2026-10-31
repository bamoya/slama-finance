import { eq } from 'drizzle-orm'

import { billingSettings } from '../../../../../../db/schema/subscriptions.js'
import type { Transaction } from '../../../../../lib/db.js'

export function createBillingSettingsRepository() {
  return {
    async settings(tx: Transaction, lock = false) {
      const query = tx.select().from(billingSettings).where(eq(billingSettings.id, 1))
      const [row] = lock ? await query.for('update') : await query
      return row!
    },
    async updateSettings(
      values: Pick<
        typeof billingSettings.$inferInsert,
        'taxRateBasisPoints' | 'paymentMethods' | 'paymentInstructions'
      >,
      tx: Transaction,
    ) {
      const [row] = await tx
        .update(billingSettings)
        .set(values)
        .where(eq(billingSettings.id, 1))
        .returning()
      return row!
    },
  }
}
