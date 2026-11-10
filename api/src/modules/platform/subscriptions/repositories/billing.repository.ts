import { and, desc, eq, gt, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm'

import { planVersions } from '../../../../../db/schema/subscription-catalog.js'
import {
  subscriptionPeriodNotes,
  subscriptionPeriods,
  subscriptionScheduledChanges,
  subscriptionSuspensions,
} from '../../../../../db/schema/subscription-periods.js'
import {
  billingSettings,
  ownerSubscriptions,
  subscriptionPayments,
} from '../../../../../db/schema/subscriptions.js'
import type { Database, Transaction } from '../../../../lib/db.js'
import {
  createBillingDocumentsRepository,
  type PaymentDocuments,
} from './billing-documents.repository.js'

/**
 * A payment with the number of the catalog version it pinned at submission (never re-resolved) and
 * its billing documents (quote expiry, allocated receipts, invoice number).
 */
export type PaymentRow = typeof subscriptionPayments.$inferSelect & {
  planVersionNumber: number
} & PaymentDocuments
const documents = createBillingDocumentsRepository()

/** Plain join on the immutable pin: no catalog validation, so payment history stays readable. */
async function withVersions(rows: (typeof subscriptionPayments.$inferSelect)[], tx: Transaction) {
  const ids = [...new Set(rows.map((r) => r.planVersionId))]
  const numbers = new Map(
    ids.length
      ? (
          await tx
            .select({ id: planVersions.id, n: planVersions.versionNumber })
            .from(planVersions)
            .where(inArray(planVersions.id, ids))
        ).map((v) => [v.id, v.n])
      : [],
  )
  const docs = await documents.forPayments(rows, tx)
  return rows.map((r) => {
    const planVersionNumber = numbers.get(r.planVersionId)
    if (planVersionNumber === undefined)
      throw new Error(`Payment ${r.id} pins an unreadable catalog version`)
    return { ...r, planVersionNumber, ...docs.get(r.id)! }
  })
}
const one = async (row: typeof subscriptionPayments.$inferSelect | undefined, tx: Transaction) =>
  row ? (await withVersions([row], tx))[0]! : undefined

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
    payments: async (ownerId: string, tx: Transaction) =>
      withVersions(
        await tx
          .select()
          .from(subscriptionPayments)
          .where(eq(subscriptionPayments.ownerId, ownerId))
          .orderBy(desc(subscriptionPayments.submittedAt)),
        tx,
      ),
    async payment(id: string, tx: Transaction) {
      const [row] = await tx
        .select()
        .from(subscriptionPayments)
        .where(eq(subscriptionPayments.id, id))
        .for('update')
      return one(row, tx)
    },
    async submit(values: typeof subscriptionPayments.$inferInsert, tx: Transaction) {
      const [row] = await tx.insert(subscriptionPayments).values(values).returning()
      return (await one(row, tx))!
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
      return one(row, tx)
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
    /**
     * Coverage period (S5b dual write). Paid periods are idempotent on their payment; complimentary
     * periods carry the administrator's note. Overlap/supersession rules are checked at commit.
     */
    async insertPeriod(
      values: {
        ownerId: string
        kind: 'paid' | 'complimentary'
        planCode: string
        planVersionId: string
        cycle: 'monthly' | 'annual' | null
        start: Date
        end: Date
        paymentId?: string
        note?: { reason: string; adminId: string }
      },
      tx: Transaction,
    ) {
      const [row] = await tx
        .insert(subscriptionPeriods)
        .values({
          ownerId: values.ownerId,
          kind: values.kind,
          planCode: values.planCode,
          planVersionId: values.planVersionId,
          cycle: values.cycle,
          startsAt: values.start,
          endsAt: values.end,
          source: values.kind === 'paid' ? 'payment' : 'admin_grant',
          paymentId: values.paymentId ?? null,
        })
        .onConflictDoNothing({ target: subscriptionPeriods.paymentId })
        .returning({ id: subscriptionPeriods.id })
      if (row && values.note)
        await tx.insert(subscriptionPeriodNotes).values({
          periodId: row.id,
          reason: values.note.reason,
          createdBy: values.note.adminId,
        })
      return row?.id ?? null
    },
    /** The rest of the coverage period running at `at` is replaced by `by` (later start wins). */
    supersedeAt: (ownerId: string, at: Date, by: string, tx: Transaction) =>
      tx
        .update(subscriptionPeriods)
        .set({ supersededAt: at, supersededBy: by })
        .where(
          and(
            eq(subscriptionPeriods.ownerId, ownerId),
            ne(subscriptionPeriods.kind, 'trial'),
            ne(subscriptionPeriods.id, by),
            isNull(subscriptionPeriods.supersededAt),
            lt(subscriptionPeriods.startsAt, at),
            gt(subscriptionPeriods.endsAt, at),
          ),
        ),
    /**
     * Administrator grant or adjustment: a confirmed zero-amount coverage row. Still written during
     * the S5b dual write so the legacy resolver and every legacy SQL mirror stay unchanged (S5c removes it).
     */
    async adjustment(
      values: {
        ownerId: string
        planCode: string
        planVersionId: string
        cycle: 'monthly' | 'annual'
        kind: 'activation' | 'renewal' | 'upgrade'
        start: Date
        end: Date
        graceless?: boolean
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
          planVersionId: values.planVersionId,
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
          graceless: values.graceless ?? false,
        })
        .returning()
      return row!
    },
    /** Latest end of all coverage periods (paid-through of the period model). */
    async periodsEnd(ownerId: string, tx: Transaction) {
      const [row] = await tx
        .select({
          end: sql<
            string | null
          >`max(coalesce(${subscriptionPeriods.supersededAt},${subscriptionPeriods.endsAt}))`,
        })
        .from(subscriptionPeriods)
        .where(and(eq(subscriptionPeriods.ownerId, ownerId), ne(subscriptionPeriods.kind, 'trial')))
      return row?.end ? new Date(row.end) : null
    },
    openSuspension: (ownerId: string, startedAt: Date, tx: Transaction) =>
      tx.insert(subscriptionSuspensions).values({ ownerId, startedAt }),
    /** Controlled shift (SECURITY DEFINER): closes the suspension and moves periods/changes. */
    async shiftPeriods(ownerId: string, since: Date, byMs: number, tx: Transaction) {
      await tx.execute(
        sql`select subscription_periods_shift(${ownerId}::uuid,${since.toISOString()}::timestamptz,${byMs}::bigint)`,
      )
    },
    async scheduledCancel(ownerId: string, tx: Transaction) {
      const [row] = await tx
        .select()
        .from(subscriptionScheduledChanges)
        .where(
          and(
            eq(subscriptionScheduledChanges.ownerId, ownerId),
            eq(subscriptionScheduledChanges.kind, 'cancel'),
            eq(subscriptionScheduledChanges.status, 'scheduled'),
          ),
        )
      return row
    },
    /** The notified version transition still scheduled (S8 creates them; at most one per owner). */
    async versionTransition(ownerId: string, tx: Transaction) {
      const [row] = await tx
        .select()
        .from(subscriptionScheduledChanges)
        .where(
          and(
            eq(subscriptionScheduledChanges.ownerId, ownerId),
            eq(subscriptionScheduledChanges.kind, 'version_transition'),
            eq(subscriptionScheduledChanges.status, 'scheduled'),
          ),
        )
      return row
    },
    applyScheduledChange: (id: string, tx: Transaction) =>
      tx
        .update(subscriptionScheduledChanges)
        .set({ status: 'applied' })
        .where(
          and(
            eq(subscriptionScheduledChanges.id, id),
            eq(subscriptionScheduledChanges.status, 'scheduled'),
          ),
        ),
    scheduleCancel: (
      ownerId: string,
      effectiveAt: Date,
      actor: { type: 'owner'; ownerId: string } | { type: 'admin'; adminId: string },
      tx: Transaction,
    ) =>
      tx.insert(subscriptionScheduledChanges).values({
        ownerId,
        kind: 'cancel',
        effectiveAt,
        createdBy: actor.type,
        actorOwnerId: actor.type === 'owner' ? actor.ownerId : null,
        actorAdminId: actor.type === 'admin' ? actor.adminId : null,
      }),
    endScheduledChange: (id: string, status: 'cancelled' | 'superseded', tx: Transaction) =>
      tx
        .update(subscriptionScheduledChanges)
        .set({ status })
        .where(
          and(
            eq(subscriptionScheduledChanges.id, id),
            eq(subscriptionScheduledChanges.status, 'scheduled'),
          ),
        ),
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
      // Preserve paid grace in the legacy rollback mirror too. Synthetic free adjustments never
      // earn this shift; a cancellation or fully elapsed grace cannot restore expired access.
      const [last] = await tx
        .select({
          payment: subscriptionPayments,
          cancel: ownerSubscriptions.cancelAtPeriodEnd,
          // Compare before shifting, in PostgreSQL, preserving imported microsecond precision.
          matchesMarker: sql<boolean>`${ownerSubscriptions.paidThroughAt}=${subscriptionPayments.coverageEnd}`,
        })
        .from(subscriptionPayments)
        .innerJoin(ownerSubscriptions, eq(ownerSubscriptions.ownerId, subscriptionPayments.ownerId))
        .where(
          and(
            eq(subscriptionPayments.ownerId, ownerId),
            eq(subscriptionPayments.status, 'confirmed'),
          ),
        )
        .orderBy(desc(subscriptionPayments.coverageEnd), desc(subscriptionPayments.coverageStart))
        .limit(1)
      const end = last?.payment.coverageEnd
      const grace =
        last &&
        !last.cancel &&
        last.payment.method !== 'admin_adjustment' &&
        end &&
        end.getTime() <= from.getTime() &&
        end.getTime() + 7 * 86_400_000 > from.getTime()
          ? last.payment
          : null

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
            or(
              gt(subscriptionPayments.coverageEnd, from),
              grace ? eq(subscriptionPayments.id, grace.id) : undefined,
            ),
          ),
        )
      await tx
        .update(ownerSubscriptions)
        .set({
          paidThroughAt: sql`case when ${ownerSubscriptions.paidThroughAt}>${at} or ${Boolean(grace && last?.matchesMarker)} then ${ownerSubscriptions.paidThroughAt}+${by} else ${ownerSubscriptions.paidThroughAt} end`,
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
  }
}
