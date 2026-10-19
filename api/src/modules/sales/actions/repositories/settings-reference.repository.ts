import { asc, eq, inArray, sql } from 'drizzle-orm'

import { estimates } from '../../../../../db/schema/estimates.js'
import { invoices } from '../../../../../db/schema/invoices.js'
import { payments } from '../../../../../db/schema/payments.js'
import { auditEvents, bankAccounts } from '../../../../../db/schema/settings.js'
import type { Transaction } from '../../../../lib/db.js'

async function settingsReferenceGraph(
  tx: Transaction,
  resource: 'bank_accounts' | 'templates',
  ids: string[],
) {
  const column = resource === 'templates' ? 'templateId' : 'bankAccountId'
  return {
    estimates: await tx
      .select()
      .from(estimates)
      .where(inArray(estimates[column], ids))
      .orderBy(asc(estimates.id))
      .for('update'),
    invoices: await tx
      .select()
      .from(invoices)
      .where(inArray(invoices[column], ids))
      .orderBy(asc(invoices.id))
      .for('update'),
    payments:
      resource === 'bank_accounts'
        ? await tx
            .select()
            .from(payments)
            .where(inArray(payments.bankAccountId, ids))
            .orderBy(asc(payments.id))
            .for('update')
        : [],
    banks:
      resource === 'bank_accounts'
        ? await tx
            .select()
            .from(bankAccounts)
            .where(inArray(bankAccounts.id, ids))
            .orderBy(asc(bankAccounts.id))
        : [],
  }
}
export function createSettingsReferenceRepository() {
  return {
    graph: settingsReferenceGraph,
    async detach(
      tx: Transaction,
      resource: 'bank_accounts' | 'templates',
      state: SettingsReferenceState,
      actor: string,
    ) {
      for (const [table, schema, rows] of [
        ['estimates', estimates, state.estimates],
        ['invoices', invoices, state.invoices],
      ] as const) {
        for (const before of rows) {
          const [after] = await tx
            .update(schema)
            .set({
              ...(resource === 'templates' ? { templateId: null } : { bankAccountId: null }),
              version: sql`${schema.version} + 1`,
              updatedAt: new Date(),
              updatedByUserId: actor,
            })
            .where(eq(schema.id, before.id))
            .returning()
          await tx.insert(auditEvents).values({
            actorUserId: actor,
            actorKind: 'user',
            action: 'detach_setting',
            entityTable: table,
            entityKey: { id: before.id },
            beforeValues: before,
            afterValues: after,
          })
        }
      }
      for (const before of state.payments) {
        const bank = state.banks.find((bank) => bank.id === before.bankAccountId)
        const snapshot =
          before.bankAccountSnapshot ??
          (bank
            ? {
                bankName: bank.bankName,
                accountHolder: bank.accountHolder,
                rib: bank.rib,
                iban: bank.iban,
              }
            : null)
        // Technical reference detachment must not invalidate an already issued receipt.
        const [after] = await tx
          .update(payments)
          .set({
            bankAccountId: null,
            bankAccountSnapshot: snapshot,
            updatedAt: new Date(),
            updatedByUserId: actor,
          })
          .where(eq(payments.id, before.id))
          .returning()
        await tx.insert(auditEvents).values({
          actorUserId: actor,
          actorKind: 'user',
          action: 'detach_bank',
          entityTable: 'payments',
          entityKey: { id: before.id },
          beforeValues: before,
          afterValues: after,
        })
      }
    },
  }
}
type SettingsReferenceState = Awaited<ReturnType<typeof settingsReferenceGraph>>
