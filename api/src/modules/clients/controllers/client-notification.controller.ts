import type { FastifyReply, FastifyRequest } from 'fastify'

import {
  ClientNotificationPreferenceInputSchema,
  ClientNotificationPreferenceVersionSchema,
  deleteClientNotificationPreferenceParamsSchema,
  listClientNotificationPreferencesParamsSchema,
  updateClientNotificationPreferenceParamsSchema,
} from '../../../contracts/generated/clients/notification-preferences.schemas.js'
import type { createClientNotificationService } from '../services/client-notification.service.js'

export function createClientNotificationController(
  service: ReturnType<typeof createClientNotificationService>,
) {
  return {
    list: (r: FastifyRequest) =>
      service.list(
        listClientNotificationPreferencesParamsSchema.parse(r.params).id,
        r.actor!.userId,
      ),
    upsert: (r: FastifyRequest) => {
      const p = updateClientNotificationPreferenceParamsSchema.parse(r.params)
      return service.upsert(
        p.id,
        p.ruleId,
        ClientNotificationPreferenceInputSchema.parse(r.body),
        r.actor!.userId,
      )
    },
    remove: async (r: FastifyRequest, reply: FastifyReply) => {
      const p = deleteClientNotificationPreferenceParamsSchema.parse(r.params)
      await service.remove(
        p.id,
        p.ruleId,
        ClientNotificationPreferenceVersionSchema.parse(r.body).expectedVersion,
        r.actor!.userId,
      )
      return reply.code(204).send()
    },
  }
}
