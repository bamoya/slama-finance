import type { NotificationRule } from '../../contracts/generated/settings/notifications.schemas.js'
import type { Transaction } from '../../lib/db.js'

export interface EffectiveClientNotification {
  clientId: string | null
  recipient: string | null
  cc: string[]
  clientName: string
  enabled: boolean
  reason: string | null
}
export interface ClientNotificationsPublicApi {
  effective(
    clientId: string | null,
    rule: NotificationRule,
    tx?: Transaction,
    manual?: boolean,
  ): Promise<EffectiveClientNotification>
}
