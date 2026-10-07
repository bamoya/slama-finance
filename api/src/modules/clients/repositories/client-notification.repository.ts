import { and, eq, sql } from 'drizzle-orm'

import { clients } from '../../../../db/schema/clients.js'
import { clientNotificationPreferences } from '../../../../db/schema/notifications.js'
import { auditEvents } from '../../../../db/schema/settings.js'
import type { Database, Transaction } from '../../../lib/db.js'
import { AppError } from '../../../lib/errors.js'
import { createClientRepository } from './client.repository.js'

export function createClientNotificationRepository(database: () => Database) {
  const base = createClientRepository(database)
  return {
    transaction: base.transaction,
    authorize: base.authorize,
    async audit(
      tx: Transaction,
      actor: string,
      id: string,
      action: string,
      before: unknown,
      after: unknown,
    ) {
      await tx.insert(auditEvents).values({
        actorUserId: actor,
        actorKind: 'user',
        action,
        entityTable: 'client_notification_preferences',
        entityKey: { clientId: id },
        beforeValues: before,
        afterValues: after,
      })
    },
    async client(id: string, tx: Database | Transaction = database(), lock = false) {
      const q = tx.select().from(clients).where(eq(clients.id, id))
      const [row] = lock ? await q.for('update') : await q
      if (!row) throw new AppError(404, 'CLIENT_NOT_FOUND', 'Client not found.')
      return row
    },
    async preference(id: string, ruleId: string, tx: Database | Transaction = database()) {
      const [row] = await tx
        .select()
        .from(clientNotificationPreferences)
        .where(
          and(
            eq(clientNotificationPreferences.clientId, id),
            eq(clientNotificationPreferences.ruleId, ruleId),
          ),
        )
      return row ?? null
    },
    async upsert(
      id: string,
      ruleId: string,
      input: { enabled: boolean; cc: string[] },
      actor: string,
      tx: Transaction,
    ) {
      const [row] = await tx
        .insert(clientNotificationPreferences)
        .values({ clientId: id, ruleId, ...input, createdByUserId: actor, updatedByUserId: actor })
        .onConflictDoUpdate({
          target: [clientNotificationPreferences.clientId, clientNotificationPreferences.ruleId],
          set: {
            ...input,
            version: sql`${clientNotificationPreferences.version}+1`,
            updatedAt: new Date(),
            updatedByUserId: actor,
          },
        })
        .returning()
      return row!
    },
    remove(id: string, ruleId: string, tx: Transaction) {
      return tx
        .delete(clientNotificationPreferences)
        .where(
          and(
            eq(clientNotificationPreferences.clientId, id),
            eq(clientNotificationPreferences.ruleId, ruleId),
          ),
        )
    },
  }
}
