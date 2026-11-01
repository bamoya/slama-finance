import { eq, sql } from 'drizzle-orm'

import { users } from '../../../../../../db/schema/auth.js'
import { notificationRules } from '../../../../../../db/schema/notifications.js'
import { auditEvents } from '../../../../../../db/schema/settings.js'
import type { NotificationRuleUpdate } from '../../../../../contracts/generated/settings/notifications.schemas.js'
import type { Database, Transaction } from '../../../../../lib/db.js'
import { AppError } from '../../../../../lib/errors.js'
import { createSettingsRepository } from '../../repositories/settings.repository.js'

export type RuleRow = typeof notificationRules.$inferSelect
export function createNotificationRuleRepository(database: () => Database) {
  const base = createSettingsRepository(database)
  return {
    transaction: base.transaction,
    authorize: base.authorizeWrite,
    company: base.company,
    /** Business emails are sent in the organization's name: trade name, legal name, then registered name. */
    async organizationName(tx: Database | Transaction = database()) {
      const [row] = await tx.execute<{ name: string | null }>(
        sql`select coalesce(nullif(btrim(c.trade_name),''), nullif(btrim(c.legal_name),''), (select o.name from organizations o where o.id = c.organization_id)) as name from company_settings c where c.id = 1`,
      )
      return row?.name ?? ''
    },
    list(tx: Database | Transaction = database()) {
      return tx.select().from(notificationRules).orderBy(notificationRules.eventKey)
    },
    async rule(id: string, tx: Database | Transaction = database(), lock = false) {
      const q = tx.select().from(notificationRules).where(eq(notificationRules.id, id))
      const [row] = lock ? await q.for('update') : await q
      if (!row)
        throw new AppError(404, 'NOTIFICATION_RULE_NOT_FOUND', 'Notification rule not found.')
      return row
    },
    async event(event: string, tx: Database | Transaction = database()) {
      const [row] = await tx
        .select()
        .from(notificationRules)
        .where(eq(notificationRules.eventKey, event))
      if (!row)
        throw new AppError(404, 'NOTIFICATION_RULE_NOT_FOUND', 'Notification rule not found.')
      return row
    },
    async operator(id: string, tx: Transaction) {
      const [row] = await tx.select({ email: users.email }).from(users).where(eq(users.id, id))
      if (!row) throw new AppError(403, 'FORBIDDEN', 'Operator unavailable.')
      return row
    },
    async update(
      id: string,
      input: Omit<NotificationRuleUpdate, 'expectedVersion'>,
      actor: string,
      tx: Transaction,
    ) {
      const [row] = await tx
        .update(notificationRules)
        .set({
          ...input,
          version: sql`${notificationRules.version}+1`,
          updatedAt: new Date(),
          updatedByActorId: actor,
        })
        .where(eq(notificationRules.id, id))
        .returning()
      return row!
    },
    async audit(
      tx: Transaction,
      actor: string,
      action: string,
      id: string,
      before: unknown,
      after: unknown,
    ) {
      await tx.insert(auditEvents).values({
        actorId: actor,
        actorKind: 'user',
        action,
        entityTable: 'notification_rules',
        entityKey: { id },
        beforeValues: before,
        afterValues: after,
      })
    },
  }
}
