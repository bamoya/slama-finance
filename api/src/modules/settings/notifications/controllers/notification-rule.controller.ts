import type { FastifyReply, FastifyRequest } from 'fastify'

import {
  NotificationRulePreviewInputSchema,
  NotificationRuleUpdateSchema,
  previewNotificationRuleParamsSchema,
  testNotificationRuleParamsSchema,
  updateNotificationRuleParamsSchema,
} from '../../../../contracts/generated/settings/notifications.schemas.js'
import type { createNotificationRuleService } from '../services/notification-rule.service.js'

export function createNotificationRuleController(
  service: ReturnType<typeof createNotificationRuleService>,
) {
  return {
    list: () => service.list(),
    preview: (r: FastifyRequest) =>
      service.preview(
        previewNotificationRuleParamsSchema.parse(r.params).id,
        NotificationRulePreviewInputSchema.parse(r.body),
        r.actor!.userId,
      ),
    update: (r: FastifyRequest) =>
      service.update(
        updateNotificationRuleParamsSchema.parse(r.params).id,
        NotificationRuleUpdateSchema.parse(r.body),
        r.actor!.userId,
      ),
    test: async (r: FastifyRequest, reply: FastifyReply) =>
      reply
        .code(202)
        .send(
          await service.test(testNotificationRuleParamsSchema.parse(r.params).id, r.actor!.userId),
        ),
  }
}
