import type { FastifyInstance, preHandlerHookHandler } from 'fastify'

import type { createSettingsController } from '../controllers/settings.controller.js'

export function registerSettingsRoutes(
  app: FastifyInstance,
  controller: ReturnType<typeof createSettingsController>,
  requirePermission: (key: string) => preHandlerHookHandler,
) {
  app.post(
    '/bank-accounts/:id/restore',
    { preHandler: requirePermission('bank_accounts.update') },
    controller.restoreBank,
  )
  app.delete(
    '/bank-accounts/:id',
    { preHandler: requirePermission('bank_accounts.delete') },
    controller.deleteBank,
  )
  app.delete(
    '/document-templates/:id',
    { preHandler: requirePermission('templates.delete') },
    controller.deleteTemplate,
  )
  app.get(
    '/company-settings',
    { preHandler: requirePermission('company_settings.read') },
    controller.company,
  )
  app.patch(
    '/company-settings',
    { preHandler: requirePermission('company_settings.update') },
    controller.updateCompany,
  )
  app.get(
    '/bank-accounts',
    { preHandler: requirePermission('bank_accounts.read') },
    controller.banks,
  )
  app.get(
    '/bank-accounts/:id',
    { preHandler: requirePermission('bank_accounts.read') },
    controller.bank,
  )
  app.post(
    '/bank-accounts',
    { preHandler: requirePermission('bank_accounts.create') },
    controller.createBank,
  )
  app.patch(
    '/bank-accounts/:id',
    { preHandler: requirePermission('bank_accounts.update') },
    controller.updateBank,
  )
  app.post(
    '/bank-accounts/:id/archive',
    { preHandler: requirePermission('bank_accounts.update') },
    controller.archiveBank,
  )
  app.get(
    '/document-templates',
    { preHandler: requirePermission('templates.read') },
    controller.templates,
  )
  app.get(
    '/document-templates/:id',
    { preHandler: requirePermission('templates.read') },
    controller.template,
  )
  app.post(
    '/document-templates',
    { preHandler: requirePermission('templates.create') },
    controller.createTemplate,
  )
  app.patch(
    '/document-templates/:id',
    { preHandler: requirePermission('templates.update') },
    controller.updateTemplate,
  )
  app.post(
    '/document-templates/:id/archive',
    { preHandler: requirePermission('templates.update') },
    controller.archiveTemplate,
  )
  app.post(
    '/document-templates/preview',
    {
      preHandler: requirePermission('templates.read'),
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    controller.preview,
  )
}
