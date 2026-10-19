import { asc, inArray } from 'drizzle-orm'

import { clients } from '../../../../db/schema/clients.js'
import { clientNotificationPreferences } from '../../../../db/schema/notifications.js'
import type { Transaction } from '../../../lib/db.js'

export function createClientDeletionRepository() {
  return {
    async graph(ids: string[], tx: Transaction) {
      return {
        clients: await tx
          .select()
          .from(clients)
          .where(inArray(clients.id, ids))
          .orderBy(asc(clients.id))
          .for('update'),
        preferences: await tx
          .select()
          .from(clientNotificationPreferences)
          .where(inArray(clientNotificationPreferences.clientId, ids))
          .orderBy(
            asc(clientNotificationPreferences.clientId),
            asc(clientNotificationPreferences.ruleId),
          ),
      }
    },
    async remove(ids: string[], tx: Transaction) {
      await tx
        .delete(clientNotificationPreferences)
        .where(inArray(clientNotificationPreferences.clientId, ids))
      await tx.delete(clients).where(inArray(clients.id, ids))
    },
  }
}
