import type { FastifyRequest } from 'fastify'

import { AdminBillingSettingsUpdateSchema } from '../../../../../contracts/generated/administration/administration.schemas.js'
import type { AuthenticatedAdmin } from '../../shared/types/authenticated-admin.js'
import type { createBillingSettingsService } from '../services/billing-settings.service.js'

type CurrentAdmin = (request: FastifyRequest) => AuthenticatedAdmin

export function createBillingSettingsController(
  settings: ReturnType<typeof createBillingSettingsService>,
  currentAdmin: CurrentAdmin,
) {
  return {
    get: () => settings.get(),
    async update(request: FastifyRequest) {
      return settings.update(
        currentAdmin(request),
        AdminBillingSettingsUpdateSchema.parse(request.body),
      )
    },
  }
}
