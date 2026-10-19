import type { FastifyInstance, preHandlerHookHandler } from 'fastify'

import {
  ConfirmSettingsDeletionSchema,
  SettingsDeletionSelectionSchema,
} from '../../../contracts/generated/settings/deletion.schemas.js'
import type { createSettingsDeletionController } from '../controllers/settings-deletion.controller.js'

export function registerSettingsDeletionRoutes(
  app: FastifyInstance,
  controller: ReturnType<typeof createSettingsDeletionController>,
  permission: (key: string) => preHandlerHookHandler,
) {
  const authorize = (confirm: boolean): preHandlerHookHandler =>
    async function (request, reply) {
      const { resource } = (
        confirm ? ConfirmSettingsDeletionSchema : SettingsDeletionSelectionSchema
      ).parse(request.body)
      await permission(`${resource}.delete`).call(this, request, reply, () => {})
    }
  app.post('/settings/deletion/preview', { preHandler: authorize(false) }, controller.preview)
  app.post('/settings/deletion', { preHandler: authorize(true) }, controller.confirm)
}
