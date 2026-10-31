import { and, asc, desc, eq, ne, sql } from 'drizzle-orm'

import {
  billingSettings,
  ownerSubscriptions,
  subscriptionPayments,
  subscriptionPlans,
} from '../../../../../db/schema/subscriptions.js'
import type { Database, Transaction } from '../../../../lib/db.js'

export type PaymentRow = typeof subscriptionPayments.$inferSelect

export function createBillingRepository(database: () => Database) {
  return {
    /** Administrator path: only privileged operator tooling may establish this context. */
    admin: <T>(work: (tx: Transaction) => Promise<T>) =>
      database().transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('app.actor_type','platform_admin',true),set_config('app.owner_id','',true),set_config('app.organization_id','',true)`,
        )
        return work(tx)
      }),
    async settings(tx: Transaction) {
      const [row] = await tx.select().from(billingSettings).where(eq(billingSettings.id, 1))
      return row!
    },
    paidPlans: (tx: Transaction) =>
      tx
        .select()
        .from(subscriptionPlans)
        .where(ne(subscriptionPlans.code, 'trial'))
        .orderBy(asc(subscriptionPlans.rank)),
    async plan(code: string, tx: Transaction) {
      const [row] = await tx
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.code, code))
      return row
    },
    payments: (ownerId: string, tx: Transaction) =>
      tx
        .select()
        .from(subscriptionPayments)
        .where(eq(subscriptionPayments.ownerId, ownerId))
        .orderBy(desc(subscriptionPayments.submittedAt)),
    coverage: (ownerId: string, tx: Transaction) =>
      tx
        .select()
        .from(subscriptionPayments)
        .where(
          and(
            eq(subscriptionPayments.ownerId, ownerId),
            eq(subscriptionPayments.status, 'confirmed'),
          ),
        )
        .orderBy(asc(subscriptionPayments.coverageStart), asc(subscriptionPayments.decidedAt)),
    async payment(id: string, tx: Transaction) {
      const [row] = await tx
        .select()
        .from(subscriptionPayments)
        .where(eq(subscriptionPayments.id, id))
        .for('update')
      return row
    },
    async submit(values: typeof subscriptionPayments.$inferInsert, tx: Transaction) {
      const [row] = await tx.insert(subscriptionPayments).values(values).returning()
      return row!
    },
    async decide(
      id: string,
      values: Partial<typeof subscriptionPayments.$inferInsert>,
      tx: Transaction,
    ) {
      const [row] = await tx
        .update(subscriptionPayments)
        .set(values)
        .where(and(eq(subscriptionPayments.id, id), eq(subscriptionPayments.status, 'submitted')))
        .returning()
      return row
    },
    applyCoverage: (
      ownerId: string,
      values: { paidThroughAt: Date; planCode?: string },
      tx: Transaction,
    ) =>
      tx
        .update(ownerSubscriptions)
        .set({
          paidThroughAt: sql`greatest(${ownerSubscriptions.paidThroughAt},${values.paidThroughAt.toISOString()}::timestamptz)`,
          cancelAtPeriodEnd: false,
          ...(values.planCode ? { planCode: values.planCode } : {}),
        })
        .where(eq(ownerSubscriptions.ownerId, ownerId)),
    setCancellation: (ownerId: string, cancel: boolean, tx: Transaction) =>
      tx
        .update(ownerSubscriptions)
        .set({ cancelAtPeriodEnd: cancel })
        .where(eq(ownerSubscriptions.ownerId, ownerId)),
    /** Calendar months in Africa/Casablanca, so coverage keeps the local day across offset changes. */
    async addCycle(start: Date, cycle: 'monthly' | 'annual', tx: Transaction) {
      const [r] = await tx.execute(
        sql`select (((${start.toISOString()}::timestamptz at time zone 'Africa/Casablanca') + ${cycle === 'annual' ? '12 months' : '1 month'}::interval) at time zone 'Africa/Casablanca')::text as finish`,
      )
      return new Date(String(r!.finish))
    },
  }
}
