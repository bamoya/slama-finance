import { desc, eq, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { platformAdmins } from '../../../../../../db/schema/administration.js'
import { platformUsers } from '../../../../../../db/schema/organizations.js'
import { entitlementDefinitions } from '../../../../../../db/schema/subscription-catalog.js'
import {
  subscriptionOverrideNotes,
  subscriptionOverrides,
} from '../../../../../../db/schema/subscription-overrides.js'
import type { Transaction } from '../../../../../lib/db.js'

const revoker = alias(platformAdmins, 'revoker')

type Note = typeof subscriptionOverrideNotes.$inferSelect
export type OverrideRecord = typeof subscriptionOverrides.$inferSelect &
  Omit<Note, 'overrideId'> & {
    createdByEmail: string
    revokedByEmail: string | null
  }

export function createOverrideRepository() {
  const select = (tx: Transaction) =>
    tx
      .select({
        override: subscriptionOverrides,
        note: subscriptionOverrideNotes,
        createdByEmail: platformAdmins.email,
        revokedByEmail: revoker.email,
      })
      .from(subscriptionOverrides)
      .innerJoin(
        subscriptionOverrideNotes,
        eq(subscriptionOverrideNotes.overrideId, subscriptionOverrides.id),
      )
      .innerJoin(platformAdmins, eq(platformAdmins.id, subscriptionOverrideNotes.createdBy))
      .leftJoin(revoker, eq(revoker.id, subscriptionOverrideNotes.revokedBy))
  const flat = (r: {
    override: typeof subscriptionOverrides.$inferSelect
    note: Note
    createdByEmail: string
    revokedByEmail: string | null
  }): OverrideRecord => ({
    ...r.override,
    reason: r.note.reason,
    createdBy: r.note.createdBy,
    revokedBy: r.note.revokedBy,
    revocationReason: r.note.revocationReason,
    createdByEmail: r.createdByEmail,
    revokedByEmail: r.revokedByEmail,
  })
  return {
    /** Database time: windows and revocations are authored by the server clock (integrity guard). */
    async now(tx: Transaction) {
      const [row] = await tx.execute(sql`select now() at time zone 'UTC' as now`)
      return new Date(`${String(row!.now).replace(' ', 'T')}Z`)
    },
    async ownerExists(ownerId: string, tx: Transaction) {
      const [row] = await tx
        .select({ id: platformUsers.id })
        .from(platformUsers)
        .where(eq(platformUsers.id, ownerId))
      return Boolean(row)
    },
    async definition(key: string, tx: Transaction) {
      const [row] = await tx
        .select()
        .from(entitlementDefinitions)
        .where(eq(entitlementDefinitions.key, key))
      return row
    },
    async list(ownerId: string, tx: Transaction) {
      const rows = await select(tx)
        .where(eq(subscriptionOverrides.ownerId, ownerId))
        .orderBy(desc(subscriptionOverrides.startsAt), desc(subscriptionOverrides.createdAt))
      return rows.map(flat)
    },
    async byId(id: string, tx: Transaction, lock = false) {
      const query = select(tx).where(eq(subscriptionOverrides.id, id))
      const [row] = lock ? await query.for('update', { of: subscriptionOverrides }) : await query
      return row && flat(row)
    },
    async insert(
      values: typeof subscriptionOverrides.$inferInsert,
      note: { reason: string; createdBy: string },
      tx: Transaction,
    ) {
      const [row] = await tx.insert(subscriptionOverrides).values(values).returning()
      await tx.insert(subscriptionOverrideNotes).values({ overrideId: row!.id, ...note })
      return row!
    },
    async revoke(
      id: string,
      values: { revokedAt: Date; revokedBy: string; revocationReason: string },
      tx: Transaction,
    ) {
      // The override first: its note may record a revocation only once it is revoked.
      await tx
        .update(subscriptionOverrides)
        .set({ revokedAt: values.revokedAt })
        .where(eq(subscriptionOverrides.id, id))
      await tx
        .update(subscriptionOverrideNotes)
        .set({ revokedBy: values.revokedBy, revocationReason: values.revocationReason })
        .where(eq(subscriptionOverrideNotes.overrideId, id))
    },
  }
}
