import { and, count, desc, eq, isNull, sql } from 'drizzle-orm'

import { users } from '../../../../../db/schema/auth.js'
import { organizations } from '../../../../../db/schema/organizations.js'
import { subscriptionOverrides } from '../../../../../db/schema/subscription-overrides.js'
import {
  subscriptionPeriods,
  subscriptionScheduledChanges,
  subscriptionSuspensions,
} from '../../../../../db/schema/subscription-periods.js'
import {
  ownerSubscriptions,
  subscriptionEmails,
  subscriptionPlans,
  subscriptionStorage,
} from '../../../../../db/schema/subscriptions.js'
import type { Database, Transaction } from '../../../../lib/db.js'
import { withOwnerTransaction } from '../../../../lib/owner-context.js'
import { tenantDatabase } from '../../../../lib/tenant-database.js'
export function createSubscriptionRepository(database: () => Database) {
  return {
    storageOrganization: <T>(organizationId: string, work: (tx: Transaction) => Promise<T>) =>
      tenantDatabase(database(), organizationId).transaction(work),
    /**
     * `allowance` is the trial key (counted within the trial window) or a local calendar month
     * (YYYY-MM). Monthly rows are keyed `month:YYYY-MM`; rows written before that used
     * `month:<month start instant>`, which maps deterministically to its month by taking the UTC
     * date of the instant plus 12 hours (local midnight is within ±12 h of UTC). Each row has one
     * key, so nothing is counted twice and no stored row is rewritten.
     */
    async usage(
      ownerId: string,
      start: string | null,
      end: string | null,
      allowance: { trial: string } | { month: string } | null,
      tx: Transaction,
    ) {
      const [storage] = await tx
        .select({ bytes: sql<number>`coalesce(sum(${subscriptionStorage.byteSize}),0)::float8` })
        .from(subscriptionStorage)
        .where(eq(subscriptionStorage.ownerId, ownerId))
      const [emails] = !allowance
        ? [{ n: 0 }]
        : 'trial' in allowance
          ? await tx.execute(
              sql`select coalesce(sum(recipients),0)::int n from subscription_emails where owner_id=${ownerId} and allowance_key=${allowance.trial} and queued_at>=${start}::timestamptz and queued_at<${end}::timestamptz`,
            )
          : await tx.execute(
              sql`select coalesce(sum(recipients),0)::int n from subscription_emails where owner_id=${ownerId} and (allowance_key=${`month:${allowance.month}`} or (allowance_key like 'month:____-__-__T%' and to_char((substr(allowance_key,7)::timestamptz + interval '12 hours') at time zone 'UTC','YYYY-MM')=${allowance.month}))`,
            )
      return {
        storageBytes: storage!.bytes,
        businessEmails: Number(emails!.n),
        emailPeriodStart: start,
        emailPeriodEnd: end,
      }
    },
    async storage(key: string, tx: Transaction) {
      const [row] = await tx
        .select()
        .from(subscriptionStorage)
        .where(eq(subscriptionStorage.objectKey, key))
      return row
    },
    touchStorage: (key: string, tx: Transaction) =>
      tx
        .update(subscriptionStorage)
        .set({ touchedAt: new Date(), version: sql`${subscriptionStorage.version}+1` })
        .where(eq(subscriptionStorage.objectKey, key)),
    confirmStorage: (key: string, tx: Transaction) =>
      tx
        .update(subscriptionStorage)
        .set({ stored: true })
        .where(eq(subscriptionStorage.objectKey, key)),
    staleStorage: (ownerId: string, organizationId: string, tx: Transaction) =>
      tx
        .select()
        .from(subscriptionStorage)
        .where(
          and(
            eq(subscriptionStorage.ownerId, ownerId),
            eq(subscriptionStorage.stored, false),
            sql`starts_with(${subscriptionStorage.objectKey},${'organizations/' + organizationId + '/'}) and ${subscriptionStorage.touchedAt}<now()-interval '24 hours'`,
          ),
        )
        .limit(1000),
    releaseStaleStorage: (key: string, version: number, tx: Transaction) =>
      tx
        .delete(subscriptionStorage)
        .where(
          and(
            eq(subscriptionStorage.objectKey, key),
            eq(subscriptionStorage.stored, false),
            eq(subscriptionStorage.version, version),
          ),
        ),
    reserveStorage: (values: typeof subscriptionStorage.$inferInsert, tx: Transaction) =>
      tx.insert(subscriptionStorage).values(values),
    releaseStorage: (key: string, tx: Transaction) =>
      tx.delete(subscriptionStorage).where(eq(subscriptionStorage.objectKey, key)),
    async email(key: string, tx: Transaction) {
      const [row] = await tx
        .select()
        .from(subscriptionEmails)
        .where(eq(subscriptionEmails.messageKey, key))
      return row
    },
    reserveEmail: (values: typeof subscriptionEmails.$inferInsert, tx: Transaction) =>
      tx.insert(subscriptionEmails).values(values),
    async ownerScope<T>(ownerId: string, tx: Transaction, work: () => Promise<T>) {
      const [old] = await tx.execute(
        sql`select current_setting('app.organization_id',true) org,current_setting('app.owner_id',true) owner,current_setting('app.actor_type',true) kind`,
      )
      await tx.execute(
        sql`select set_config('app.organization_id','',true),set_config('app.owner_id',${ownerId},true),set_config('app.actor_type','owner',true)`,
      )
      const result = await work()
      await tx.execute(
        sql`select set_config('app.organization_id',${String(old?.org ?? '')},true),set_config('app.owner_id',${String(old?.owner ?? '')},true),set_config('app.actor_type',${String(old?.kind ?? '')},true)`,
      )
      return result
    },
    owner: <T>(id: string, work: (tx: Transaction) => Promise<T>) =>
      withOwnerTransaction(database(), id, work),
    async lock(ownerId: string, tx: Transaction) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${ownerId},44032))`)
    },
    async subscription(ownerId: string, tx: Transaction) {
      const [row] = await tx
        .select()
        .from(ownerSubscriptions)
        .innerJoin(subscriptionPlans, eq(subscriptionPlans.code, ownerSubscriptions.planCode))
        .where(eq(ownerSubscriptions.ownerId, ownerId))
      return row
    },
    async trial(tx: Transaction) {
      const [row] = await tx
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.code, 'trial'))
      return row!
    },
    async start(ownerId: string, tx: Transaction) {
      await tx
        .insert(ownerSubscriptions)
        .values({
          ownerId,
          planCode: 'trial',
          trialStartedAt: sql`now()`,
          trialEndsAt: sql`now()+interval '7 days'`,
        })
        .onConflictDoNothing()
    },
    /**
     * Coverage periods, suspensions and scheduled changes (values only; notes are admin-only), read in
     * ONE statement so the three datasets share a snapshot: a concurrent resume or confirmation is
     * seen entirely or not at all.
     */
    async periodState(ownerId: string, tx: Transaction) {
      const [row] = await tx.execute<{
        periods: {
          kind: 'trial' | 'paid' | 'complimentary'
          planCode: string
          cycle: 'monthly' | 'annual' | null
          startsAt: string
          endsAt: string
          supersededAt: string | null
        }[]
        suspensions: { startedAt: string; endedAt: string | null }[]
        scheduled: { kind: string; effectiveAt: string; status: string }[]
      }>(sql`select
        coalesce((select json_agg(json_build_object('kind',p.kind,'planCode',p.plan_code,'cycle',p.cycle,
          'startsAt',p.starts_at,'endsAt',p.ends_at,'supersededAt',p.superseded_at) order by p.starts_at)
          from ${subscriptionPeriods} p where p.owner_id=${ownerId}),'[]') periods,
        coalesce((select json_agg(json_build_object('startedAt',u.started_at,'endedAt',u.ended_at))
          from ${subscriptionSuspensions} u where u.owner_id=${ownerId}),'[]') suspensions,
        coalesce((select json_agg(json_build_object('kind',c.kind,'effectiveAt',c.effective_at,'status',c.status))
          from ${subscriptionScheduledChanges} c where c.owner_id=${ownerId}),'[]') scheduled`)
      const date = (value: string) => new Date(value)
      return {
        periods: row!.periods.map((p) => ({
          ...p,
          startsAt: date(p.startsAt),
          endsAt: date(p.endsAt),
          supersededAt: p.supersededAt ? date(p.supersededAt) : null,
        })),
        suspensions: row!.suspensions.map((u) => ({
          startedAt: date(u.startedAt),
          endedAt: u.endedAt ? date(u.endedAt) : null,
        })),
        scheduled: row!.scheduled.map((c) => ({ ...c, effectiveAt: date(c.effectiveAt) })),
      }
    },
    /** Database time: override windows are server-authored, so they are evaluated on the same clock. */
    async now(tx: Transaction) {
      const [row] = await tx.execute(sql`select now() at time zone 'UTC' as now`)
      return new Date(`${String(row!.now).replace(' ', 'T')}Z`)
    },
    /** Override values only (notes live in an admin-only table); latest start, then latest creation, first. */
    overrides: (ownerId: string, tx: Transaction) =>
      tx
        .select({
          entitlementKey: subscriptionOverrides.entitlementKey,
          booleanValue: subscriptionOverrides.booleanValue,
          integerValue: subscriptionOverrides.integerValue,
          isUnlimited: subscriptionOverrides.isUnlimited,
          startsAt: subscriptionOverrides.startsAt,
          endsAt: subscriptionOverrides.endsAt,
          revokedAt: subscriptionOverrides.revokedAt,
          createdAt: subscriptionOverrides.createdAt,
        })
        .from(subscriptionOverrides)
        .where(eq(subscriptionOverrides.ownerId, ownerId))
        .orderBy(desc(subscriptionOverrides.startsAt), desc(subscriptionOverrides.createdAt)),
    async organizationCount(ownerId: string, tx: Transaction) {
      const [r] = await tx
        .select({ n: count() })
        .from(organizations)
        .where(eq(organizations.ownerId, ownerId))
      return r!.n
    },
    async ownerForOrganization(tx: Transaction) {
      const [r] = await tx
        .select({ id: organizations.ownerId })
        .from(organizations)
        .where(
          eq(organizations.id, sql`nullif(current_setting('app.organization_id',true),'')::uuid`),
        )
      return r?.id
    },
    /** Paused, suspended, deleting, or owned by a blocked or deleting customer. */
    async organizationRestricted(tx: Transaction) {
      const [r] = await tx.execute(
        sql`select exists(select 1 from organizations o join platform_users p on p.id=o.owner_id where o.id=nullif(current_setting('app.organization_id',true),'')::uuid and (o.paused_at is not null or o.suspended_at is not null or o.deletion_requested_at is not null or p.blocked_at is not null or p.deletion_requested_at is not null)) as restricted`,
      )
      return Boolean(r?.restricted)
    },
    async staffCount(tx: Transaction) {
      const [r] = await tx
        .select({ n: count() })
        .from(users)
        .where(
          and(
            eq(
              users.organizationId,
              sql`nullif(current_setting('app.organization_id',true),'')::uuid`,
            ),
            isNull(users.archivedAt),
            isNull(users.deletedAt),
          ),
        )
      return r!.n
    },
  }
}
