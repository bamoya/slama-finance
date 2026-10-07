import { parsePhoneNumberFromString } from 'libphonenumber-js'

import {
  BankAccountSchema,
  CompanySettingsSchema,
  type CreateBankAccount,
  CreateBankAccountSchema,
  type CreateDocumentTemplate,
  CreateDocumentTemplateSchema,
  DocumentTemplateSchema,
  type UpdateBankAccount,
  UpdateBankAccountSchema,
  type UpdateCompanySettings,
  UpdateCompanySettingsSchema,
  type UpdateDocumentTemplate,
  UpdateDocumentTemplateSchema,
} from '../../../contracts/generated/settings/settings.schemas.js'
import { AppError } from '../../../lib/errors.js'
import { assertVersion } from '../../../lib/validation.js'
import type { MediaPublicApi } from '../../media/index.js'
import type { createSettingsRepository } from '../repositories/settings.repository.js'

const wire = (row: unknown) => JSON.parse(JSON.stringify(row)) as unknown
const normalized = <T extends object>(input: T): T =>
  Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      typeof value === 'string' ? value.trim() || null : value,
    ]),
  ) as T
function active(row: { archivedAt: Date | null }) {
  if (row.archivedAt)
    throw new AppError(409, 'RECORD_ARCHIVED', 'Archived records cannot be edited or selected.')
}
function validateBank(input: CreateBankAccount) {
  const data = CreateBankAccountSchema.parse(normalized(input))
  if (!data.rib && !data.iban)
    throw new AppError(400, 'VALIDATION_ERROR', 'Provide a RIB or IBAN.', {
      rib: ['A bank identifier is required.'],
    })
  if (data.iban) {
    const rotated = data.iban.slice(4) + data.iban.slice(0, 4)
    const numeric = rotated.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55))
    if (BigInt(numeric) % 97n !== 1n || (data.iban.startsWith('MA') && data.iban.length !== 28))
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid IBAN checksum.', {
        iban: ['Enter a valid IBAN.'],
      })
    if (data.rib && data.iban.startsWith('MA') && data.iban.slice(4) !== data.rib)
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'RIB and Moroccan IBAN must refer to the same account.',
      )
  }
  return data
}

export function createSettingsService(
  repo: ReturnType<typeof createSettingsRepository>,
  media: MediaPublicApi,
) {
  const bankDto = (row: unknown) => BankAccountSchema.parse(wire(row))
  const templateDto = (row: unknown) => DocumentTemplateSchema.parse(wire(row))
  const companyDto = (row: unknown) => CompanySettingsSchema.parse(wire(row))
  async function validateTemplate(input: CreateDocumentTemplate) {
    const data = CreateDocumentTemplateSchema.parse(normalized(input))
    if (data.showSignature && !data.signatureAssetId)
      throw new AppError(400, 'VALIDATION_ERROR', 'Upload a signature before enabling it.')
    return data
  }
  return {
    getCompany: async () => companyDto(await repo.company()),
    async updateCompany(input: UpdateCompanySettings, actor: string) {
      const { expectedVersion, ...data } = UpdateCompanySettingsSchema.parse(normalized(input))
      if (!!data.registrationNumber !== !!data.registrationCity)
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'RC number and registration city must be provided together.',
        )
      if (data.phone) {
        const phone = parsePhoneNumberFromString(data.phone, 'MA')
        if (!phone?.isValid())
          throw new AppError(400, 'VALIDATION_ERROR', 'Invalid phone number.', {
            phone: ['Enter a valid phone number.'],
          })
        data.phone = phone.number
      }
      if (data.email) data.email = data.email.toLowerCase()
      return repo.transaction(async (tx) => {
        await repo.authorizeWrite(tx, actor, 'company_settings.update')
        const before = await repo.company(tx)
        assertVersion(before.version, expectedVersion)
        if (data.logoAssetId !== before.logoAssetId)
          await media.assertAttach(tx, data.logoAssetId, 'company_logo', actor)
        if (data.defaultTemplateId) active(await repo.template(data.defaultTemplateId, tx))
        const after = await repo.updateCompany(data, actor, tx)
        await media.release(tx, [before.logoAssetId])
        await repo.audit(tx, actor, 'company_settings', 1, 'update', before, after)
        return companyDto(after)
      })
    },
    listBanks: async () => (await repo.listBanks()).map(bankDto),
    getBank: async (id: string) => bankDto(await repo.bank(id)),
    async createBank(input: CreateBankAccount, actor: string) {
      const data = validateBank(input)
      return repo.transaction(async (tx) => {
        await repo.authorizeWrite(tx, actor, 'bank_accounts.create')
        const row = await repo.createBank(data, actor, tx)
        await repo.audit(tx, actor, 'bank_accounts', row.id, 'create', null, row)
        return bankDto(row)
      })
    },
    async updateBank(id: string, input: UpdateBankAccount, actor: string) {
      const { expectedVersion, ...fields } = UpdateBankAccountSchema.parse(normalized(input))
      const data = validateBank(fields)
      return repo.transaction(async (tx) => {
        await repo.authorizeWrite(tx, actor, 'bank_accounts.update')
        const before = await repo.bank(id, tx)
        active(before)
        assertVersion(before.version, expectedVersion)
        const after = await repo.updateBank(id, data, actor, tx)
        await repo.audit(tx, actor, 'bank_accounts', id, 'update', before, after)
        return bankDto(after)
      })
    },
    async archiveBank(id: string, expectedVersion: number, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorizeWrite(tx, actor, 'bank_accounts.update')
        const before = await repo.bank(id, tx)
        active(before)
        assertVersion(before.version, expectedVersion)
        const after = await repo.updateBank(id, { archivedAt: new Date() }, actor, tx)
        await repo.audit(tx, actor, 'bank_accounts', id, 'archive', before, after)
        return bankDto(after)
      })
    },
    async restoreBank(id: string, expectedVersion: number, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorizeWrite(tx, actor, 'bank_accounts.update')
        const before = await repo.bank(id, tx)
        assertVersion(before.version, expectedVersion)
        if (!before.archivedAt)
          throw new AppError(409, 'RECORD_ACTIVE', 'This account is already active.')
        const after = await repo.updateBank(id, { archivedAt: null }, actor, tx)
        await repo.audit(tx, actor, 'bank_accounts', id, 'restore', before, after)
        return bankDto(after)
      })
    },
    async deleteBank(id: string, expectedVersion: number, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorizeWrite(tx, actor, 'bank_accounts.delete')
        const before = await repo.bank(id, tx)
        assertVersion(before.version, expectedVersion)
        // Incoming references must use RESTRICT/NO ACTION FKs, never cascading deletion.
        await repo.deleteBank(id, tx)
        await repo.audit(tx, actor, 'bank_accounts', id, 'delete', before, null)
      })
    },
    async deleteTemplate(id: string, expectedVersion: number, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorizeWrite(tx, actor, 'templates.delete')
        const before = await repo.template(id, tx)
        assertVersion(before.version, expectedVersion)
        if ((await repo.company(tx)).defaultTemplateId === id)
          throw new AppError(
            409,
            'RECORD_IN_USE',
            'This template is the company default. Change the default or archive it instead.',
          )
        await repo.deleteTemplate(id, tx)
        await media.release(tx, [before.logoAssetId, before.signatureAssetId])
        await repo.audit(tx, actor, 'document_templates', id, 'delete', before, null)
      })
    },
    listTemplates: async () => (await repo.listTemplates()).map(templateDto),
    getTemplate: async (id: string) => templateDto(await repo.template(id)),
    async createTemplate(input: CreateDocumentTemplate, actor: string) {
      const data = await validateTemplate(input)
      return repo.transaction(async (tx) => {
        await repo.authorizeWrite(tx, actor, 'templates.create')
        await media.assertAttach(tx, data.logoAssetId, 'company_logo', actor)
        await media.assertAttach(tx, data.signatureAssetId, 'company_signature', actor)
        const row = await repo.createTemplate(data, actor, tx)
        await repo.audit(tx, actor, 'document_templates', row.id, 'create', null, row)
        return templateDto(row)
      })
    },
    async updateTemplate(id: string, input: UpdateDocumentTemplate, actor: string) {
      const { expectedVersion, ...fields } = UpdateDocumentTemplateSchema.parse(normalized(input))
      const data = await validateTemplate(fields)
      return repo.transaction(async (tx) => {
        await repo.authorizeWrite(tx, actor, 'templates.update')
        const before = await repo.template(id, tx)
        active(before)
        assertVersion(before.version, expectedVersion)
        if (data.logoAssetId !== before.logoAssetId)
          await media.assertAttach(tx, data.logoAssetId, 'company_logo', actor)
        if (data.signatureAssetId !== before.signatureAssetId)
          await media.assertAttach(tx, data.signatureAssetId, 'company_signature', actor)
        const after = await repo.updateTemplate(id, data, actor, tx)
        await media.release(tx, [before.logoAssetId, before.signatureAssetId])
        await repo.audit(tx, actor, 'document_templates', id, 'update', before, after)
        return templateDto(after)
      })
    },
    async archiveTemplate(id: string, expectedVersion: number, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorizeWrite(tx, actor, 'templates.update')
        const before = await repo.template(id, tx)
        active(before)
        assertVersion(before.version, expectedVersion)
        const company = await repo.company(tx)
        if (company.defaultTemplateId === id) {
          const {
            id: _id,
            version: _v,
            createdAt: _c,
            updatedAt: _u,
            createdByUserId: _cb,
            updatedByUserId: _ub,
            ...fields
          } = company
          const { expectedVersion: _expected, ...next } = UpdateCompanySettingsSchema.parse({
            ...fields,
            defaultTemplateId: null,
            expectedVersion: company.version,
          })
          const after = await repo.updateCompany(next, actor, tx)
          await repo.audit(tx, actor, 'company_settings', 1, 'update', company, after)
        }
        const after = await repo.updateTemplate(id, { archivedAt: new Date() }, actor, tx)
        await repo.audit(tx, actor, 'document_templates', id, 'archive', before, after)
        return templateDto(after)
      })
    },
  }
}
