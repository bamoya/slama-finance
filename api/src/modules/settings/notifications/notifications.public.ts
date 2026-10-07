import type { NotificationRule } from '../../../contracts/generated/settings/notifications.schemas.js'
import type { Transaction } from '../../../lib/db.js'

export interface NotificationPolicyPublicApi {
  rule(event: string, tx?: Transaction): Promise<NotificationRule>
  rules(tx?: Transaction): Promise<NotificationRule[]>
  compose(
    rule: NotificationRule,
    values: Record<string, string>,
  ): { subject: string; html: string; text: string }
}
