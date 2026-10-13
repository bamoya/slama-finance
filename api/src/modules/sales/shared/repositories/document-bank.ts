import { eq } from 'drizzle-orm'

import { bankAccounts } from '../../../../../db/schema/settings.js'
import type { Transaction } from '../../../../lib/db.js'
import { AppError } from '../../../../lib/errors.js'

export async function documentBankSnapshot(tx: Transaction, id: string | null) {
  if (!id) return null
  const [bank] = await tx.select().from(bankAccounts).where(eq(bankAccounts.id, id))
  if (!bank || bank.archivedAt)
    throw new AppError(400, 'INVALID_BANK_ACCOUNT', 'Select an active bank account.')
  return {
    bankName: bank.bankName,
    accountHolder: bank.accountHolder,
    rib: bank.rib,
    iban: bank.iban,
  }
}
