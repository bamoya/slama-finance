import { eq } from 'drizzle-orm'

import { legalTypeRequirements } from '../../../../../../db/schema/settings.js'
import type { Transaction } from '../../../../../lib/db.js'

export type LegalField = { field: string; requiredForLegalInvoice: boolean }

/** Fields a legal type shows, with whether each is required for a legal invoice (reference data). */
export async function legalFields(tx: Transaction, legalType: string): Promise<LegalField[]> {
  return tx
    .select({
      field: legalTypeRequirements.field,
      requiredForLegalInvoice: legalTypeRequirements.requiredForLegalInvoice,
    })
    .from(legalTypeRequirements)
    .where(eq(legalTypeRequirements.legalType, legalType as 'sarl'))
}
