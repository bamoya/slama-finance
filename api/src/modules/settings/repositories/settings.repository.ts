import { and, eq, isNull, sql } from 'drizzle-orm'

import { permissions, rolePermissions, userRoles, users } from '../../../../db/schema/auth.js'
import {
  auditEvents,
  bankAccounts,
  companySettings,
  documentTemplates,
} from '../../../../db/schema/settings.js'
import type {
  CreateBankAccount,
  CreateDocumentTemplate,
  UpdateCompanySettings,
} from '../../../contracts/generated/settings/settings.schemas.js'
import type { Database, Transaction } from '../../../lib/db.js'
import { AppError } from '../../../lib/errors.js'

export function createSettingsRepository(database: () => Database) {
  return {
    transaction: <T>(work: (tx: Transaction) => Promise<T>) => database().transaction(work),
    async authorizeWrite(tx: Transaction, actorId: string, permission: string) {
      await tx.execute(sql`select pg_advisory_xact_lock(73619001)`)
      const [grant] = await tx
        .select({ id: users.id })
        .from(users)
        .innerJoin(userRoles, eq(users.id, userRoles.userId))
        .innerJoin(rolePermissions, eq(userRoles.roleId, rolePermissions.roleId))
        .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
        .where(
          and(
            eq(users.id, actorId),
            isNull(users.disabledAt),
            isNull(users.archivedAt),
            eq(users.mustChangePassword, false),
            eq(permissions.key, permission),
          ),
        )
        .limit(1)
      if (!grant) throw new AppError(403, 'FORBIDDEN', 'Your permissions have changed.')
    },
    async company(tx: Database | Transaction = database()) {
      const [row] = await tx.select().from(companySettings).where(eq(companySettings.id, 1))
      if (!row)
        throw new AppError(503, 'SETTINGS_NOT_INITIALIZED', 'Apply the company settings migration.')
      return row
    },
    async updateCompany(
      input: Omit<UpdateCompanySettings, 'expectedVersion'>,
      actor: string,
      tx: Transaction,
    ) {
      const [row] = await tx
        .update(companySettings)
        .set({
          ...input,
          updatedAt: new Date(),
          updatedByUserId: actor,
          version: sql`${companySettings.version} + 1`,
        })
        .where(eq(companySettings.id, 1))
        .returning()
      return row!
    },
    listBanks: () => database().select().from(bankAccounts).orderBy(bankAccounts.name),
    async bank(id: string, tx: Database | Transaction = database()) {
      const [row] = await tx.select().from(bankAccounts).where(eq(bankAccounts.id, id))
      if (!row) throw new AppError(404, 'BANK_ACCOUNT_NOT_FOUND', 'Bank account not found.')
      return row
    },
    async createBank(input: CreateBankAccount, actor: string, tx: Transaction) {
      const [row] = await tx
        .insert(bankAccounts)
        .values({ ...input, createdByUserId: actor, updatedByUserId: actor })
        .returning()
      return row!
    },
    async updateBank(
      id: string,
      input: Partial<CreateBankAccount> & { archivedAt?: Date | null },
      actor: string,
      tx: Transaction,
    ) {
      const [row] = await tx
        .update(bankAccounts)
        .set({
          ...input,
          updatedAt: new Date(),
          updatedByUserId: actor,
          version: sql`${bankAccounts.version} + 1`,
        })
        .where(eq(bankAccounts.id, id))
        .returning()
      return row!
    },
    deleteBank: (id: string, tx: Transaction) =>
      tx.delete(bankAccounts).where(eq(bankAccounts.id, id)),
    deleteTemplate: (id: string, tx: Transaction) =>
      tx.delete(documentTemplates).where(eq(documentTemplates.id, id)),
    listTemplates: () =>
      database().select().from(documentTemplates).orderBy(documentTemplates.name),
    async template(id: string, tx: Database | Transaction = database()) {
      const [row] = await tx.select().from(documentTemplates).where(eq(documentTemplates.id, id))
      if (!row) throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Document template not found.')
      return row
    },
    async createTemplate(input: CreateDocumentTemplate, actor: string, tx: Transaction) {
      const [row] = await tx
        .insert(documentTemplates)
        .values({ ...input, createdByUserId: actor, updatedByUserId: actor })
        .returning()
      return row!
    },
    async updateTemplate(
      id: string,
      input: Partial<CreateDocumentTemplate> & { archivedAt?: Date },
      actor: string,
      tx: Transaction,
    ) {
      const [row] = await tx
        .update(documentTemplates)
        .set({
          ...input,
          updatedAt: new Date(),
          updatedByUserId: actor,
          version: sql`${documentTemplates.version} + 1`,
        })
        .where(eq(documentTemplates.id, id))
        .returning()
      return row!
    },
    async audit(
      tx: Transaction,
      actor: string,
      entityTable: 'company_settings' | 'bank_accounts' | 'document_templates',
      id: string | number,
      action: 'create' | 'update' | 'archive' | 'restore' | 'delete',
      before: unknown,
      after: unknown,
    ) {
      await tx.insert(auditEvents).values({
        actorUserId: actor,
        actorKind: 'user',
        entityTable,
        entityKey: { id },
        action,
        beforeValues: before ? JSON.parse(JSON.stringify(before)) : null,
        afterValues: JSON.parse(JSON.stringify(after)),
      })
    },
  }
}
