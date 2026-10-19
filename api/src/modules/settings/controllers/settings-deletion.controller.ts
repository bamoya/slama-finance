import type { FastifyReply, FastifyRequest } from 'fastify'

import {
  ConfirmSettingsDeletionSchema,
  SettingsDeletionSelectionSchema,
} from '../../../contracts/generated/settings/deletion.schemas.js'
import type { createSettingsDeletionService } from '../services/settings-deletion.service.js'

export function createSettingsDeletionController(
  service: ReturnType<typeof createSettingsDeletionService>,
) {
  return {
    preview(request: FastifyRequest) {
      return service.preview(
        SettingsDeletionSelectionSchema.parse(request.body),
        request.actor!.userId,
      )
    },
    async confirm(request: FastifyRequest, reply: FastifyReply) {
      await service.confirm(
        ConfirmSettingsDeletionSchema.parse(request.body),
        request.actor!.userId,
      )
      return reply.code(204).send()
    },
  }
}
