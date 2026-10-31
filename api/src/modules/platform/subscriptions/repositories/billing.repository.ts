import { and, asc, desc, eq, gt, ne, sql } from 'drizzle-orm'

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
    /** Administrator grant or adjustment: a confirmed zero-amount coverage row. */
    async adjustment(
      values: {
        ownerId: string
        planCode: string
        cycle: 'monthly' | 'annual'
        kind: 'activation' | 'renewal' | 'upgrade'
        start: Date
        end: Date
        decidedBy: string
        currency: string
        now: Date
      },
      tx: Transaction,
    ) {
      const [row] = await tx
        .insert(subscriptionPayments)
        .values({
          ownerId: values.ownerId,
          planCode: values.planCode,
          cycle: values.cycle,
          kind: values.kind,
          status: 'confirmed',
          method: 'admin_adjustment',
          reference: 'admin_adjustment',
          currency: values.currency,
          amountHt: 0,
          taxRateBasisPoints: null,
          taxAmount: 0,
          amountTtc: 0,
          coverageStart: values.start,
          coverageEnd: values.end,
          submittedAt: values.now,
          decidedAt: values.now,
          decidedBy: values.decidedBy,
        })
        .returning()
      return row!
    },
    extendPaidThrough: (
      ownerId: string,
      paidThroughAt: Date,
      planCode: string | null,
      tx: Transaction,
    ) =>
      tx
        .update(ownerSubscriptions)
        .set({
          paidThroughAt: sql`greatest(${ownerSubscriptions.paidThroughAt},${paidThroughAt.toISOString()}::timestamptz)`,
          ...(planCode ? { planCode } : {}),
        })
        .where(eq(ownerSubscriptions.ownerId, ownerId)),
    setTrialEnd: (ownerId: string, trialEndsAt: Date, tx: Transaction) =>
      tx
        .update(ownerSubscriptions)
        .set({ trialEndsAt })
        .where(eq(ownerSubscriptions.ownerId, ownerId)),
    setSuspended: (ownerId: string, suspendedAt: Date | null, tx: Transaction) =>
      tx
        .update(ownerSubscriptions)
        .set({ suspendedAt })
        .where(eq(ownerSubscriptions.ownerId, ownerId)),
    /** Moves every period still running at `from` forward; later periods move entirely. */
    async shiftCoverage(ownerId: string, from: Date, byMs: number, tx: Transaction) {
      const at = sql`${from.toISOString()}::timestamptz`
      const by = sql`(${byMs} * interval '1 millisecond')`
      await tx
        .update(subscriptionPayments)
        .set({
          coverageStart: sql`case when ${subscriptionPayments.coverageStart}>=${at} then ${subscriptionPayments.coverageStart}+${by} else ${subscriptionPayments.coverageStart} end`,
          coverageEnd: sql`${subscriptionPayments.coverageEnd}+${by}`,
        })
        .where(
          and(
            eq(subscriptionPayments.ownerId, ownerId),
            eq(subscriptionPayments.status, 'confirmed'),
            gt(subscriptionPayments.coverageEnd, from),
          ),
        )
      await tx
        .update(ownerSubscriptions)
        .set({
          paidThroughAt: sql`case when ${ownerSubscriptions.paidThroughAt}>${at} then ${ownerSubscriptions.paidThroughAt}+${by} else ${ownerSubscriptions.paidThroughAt} end`,
          trialEndsAt: sql`case when ${ownerSubscriptions.trialEndsAt}>${at} then ${ownerSubscriptions.trialEndsAt}+${by} else ${ownerSubscriptions.trialEndsAt} end`,
        })
        .where(eq(ownerSubscriptions.ownerId, ownerId))
    },
    /** Administrator-created paid subscription; the trial window is recorded but superseded. */
    createPaid: (
      ownerId: string,
      planCode: string,
      paidThroughAt: Date,
      now: Date,
      tx: Transaction,
    ) =>
      tx.insert(ownerSubscriptions).values({
        ownerId,
        planCode,
        trialStartedAt: now,
        trialEndsAt: new Date(now.getTime() + 7 * 86_400_000),
        paidThroughAt,
      }),
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
