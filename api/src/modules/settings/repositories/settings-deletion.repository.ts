import { asc, eq, inArray, sql } from 'drizzle-orm'

import { bankAccounts, companySettings, documentTemplates } from '../../../../db/schema/settings.js'
import type { Transaction } from '../../../lib/db.js'

export function createSettingsDeletionRepository() {
  return {
    async graph(tx: Transaction, resource: 'bank_accounts' | 'templates', ids: string[]) {
      const company = (
        await tx.select().from(companySettings).where(eq(companySettings.id, 1)).for('update')
      )[0]!
      const roots =
        resource === 'bank_accounts'
          ? await tx
              .select()
              .from(bankAccounts)
              .where(inArray(bankAccounts.id, ids))
              .orderBy(asc(bankAccounts.id))
              .for('update')
          : await tx
              .select()
              .from(documentTemplates)
              .where(inArray(documentTemplates.id, ids))
              .orderBy(asc(documentTemplates.id))
              .for('update')
      const clearDefault = ids.includes(
        (resource === 'bank_accounts' ? company.defaultBankAccountId : company.defaultTemplateId) ??
          '',
      )
      return { company, roots, clearDefault }
    },
    async remove(tx: Transaction, resource: 'bank_accounts' | 'templates', ids: string[]) {
      await tx
        .delete(resource === 'bank_accounts' ? bankAccounts : documentTemplates)
        .where(inArray((resource === 'bank_accounts' ? bankAccounts : documentTemplates).id, ids))
    },
    async clearDefault(tx: Transaction, resource: 'bank_accounts' | 'templates', actor: string) {
      const [after] = await tx
        .update(companySettings)
        .set({
          ...(resource === 'bank_accounts'
            ? { defaultBankAccountId: null }
            : { defaultTemplateId: null }),
          version: sql`${companySettings.version} + 1`,
          updatedAt: new Date(),
          updatedByUserId: actor,
        })
        .where(eq(companySettings.id, 1))
        .returning()
      return after!
    },
  }
}
