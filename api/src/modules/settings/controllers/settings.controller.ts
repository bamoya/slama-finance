import type { FastifyReply, FastifyRequest } from 'fastify'

import {
  CreateBankAccountSchema,
  CreateDocumentTemplateSchema,
  getBankAccountParamsSchema,
  getDocumentTemplateParamsSchema,
  previewDocumentTemplateQuerySchema,
  SettingsRecordVersionSchema,
  UpdateBankAccountSchema,
  UpdateCompanySettingsSchema,
  UpdateDocumentTemplateSchema,
} from '../../../contracts/generated/settings/settings.schemas.js'
import type { createPreviewService } from '../services/preview.service.js'
import type { createSettingsService } from '../services/settings.service.js'

export function createSettingsController(
  service: ReturnType<typeof createSettingsService>,
  preview: ReturnType<typeof createPreviewService>,
) {
  return {
    company: () => service.getCompany(),
    updateCompany: (r: FastifyRequest) =>
      service.updateCompany(UpdateCompanySettingsSchema.parse(r.body), r.actor!.userId),
    banks: () => service.listBanks(),
    bank: (r: FastifyRequest) => service.getBank(getBankAccountParamsSchema.parse(r.params).id),
    async createBank(r: FastifyRequest, reply: FastifyReply) {
      return reply
        .code(201)
        .send(await service.createBank(CreateBankAccountSchema.parse(r.body), r.actor!.userId))
    },
    updateBank: (r: FastifyRequest) =>
      service.updateBank(
        getBankAccountParamsSchema.parse(r.params).id,
        UpdateBankAccountSchema.parse(r.body),
        r.actor!.userId,
      ),
    archiveBank: (r: FastifyRequest) =>
      service.archiveBank(
        getBankAccountParamsSchema.parse(r.params).id,
        SettingsRecordVersionSchema.parse(r.body).expectedVersion,
        r.actor!.userId,
      ),
    restoreBank: (r: FastifyRequest) =>
      service.restoreBank(
        getBankAccountParamsSchema.parse(r.params).id,
        SettingsRecordVersionSchema.parse(r.body).expectedVersion,
        r.actor!.userId,
      ),
    async deleteBank(r: FastifyRequest, reply: FastifyReply) {
      await service.deleteBank(
        getBankAccountParamsSchema.parse(r.params).id,
        SettingsRecordVersionSchema.parse(r.body).expectedVersion,
        r.actor!.userId,
      )
      return reply.code(204).send()
    },
    async deleteTemplate(r: FastifyRequest, reply: FastifyReply) {
      await service.deleteTemplate(
        getDocumentTemplateParamsSchema.parse(r.params).id,
        SettingsRecordVersionSchema.parse(r.body).expectedVersion,
        r.actor!.userId,
      )
      return reply.code(204).send()
    },
    templates: () => service.listTemplates(),
    template: (r: FastifyRequest) =>
      service.getTemplate(getDocumentTemplateParamsSchema.parse(r.params).id),
    async createTemplate(r: FastifyRequest, reply: FastifyReply) {
      return reply
        .code(201)
        .send(
          await service.createTemplate(CreateDocumentTemplateSchema.parse(r.body), r.actor!.userId),
        )
    },
    updateTemplate: (r: FastifyRequest) =>
      service.updateTemplate(
        getDocumentTemplateParamsSchema.parse(r.params).id,
        UpdateDocumentTemplateSchema.parse(r.body),
        r.actor!.userId,
      ),
    archiveTemplate: (r: FastifyRequest) =>
      service.archiveTemplate(
        getDocumentTemplateParamsSchema.parse(r.params).id,
        SettingsRecordVersionSchema.parse(r.body).expectedVersion,
        r.actor!.userId,
      ),
    preview: (r: FastifyRequest) =>
      preview(
        CreateDocumentTemplateSchema.parse(r.body),
        r.actor!.userId,
        previewDocumentTemplateQuerySchema.parse(r.query).documentType,
        previewDocumentTemplateQuerySchema.parse(r.query).sampleSize,
      ),
  }
}
