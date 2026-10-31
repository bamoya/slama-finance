import { and, count, eq, isNull, sql } from 'drizzle-orm'

import { users } from '../../../../../db/schema/auth.js'
import { organizations } from '../../../../../db/schema/organizations.js'
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
    async month(now: Date, tx: Transaction) {
      const [r] = await tx.execute(
        sql`select (date_trunc('month',${now.toISOString()}::timestamptz at time zone 'Africa/Casablanca') at time zone 'Africa/Casablanca')::text start, ((date_trunc('month',${now.toISOString()}::timestamptz at time zone 'Africa/Casablanca')+interval '1 month') at time zone 'Africa/Casablanca')::text finish`,
      )
      return {
        start: new Date(String(r!.start)).toISOString(),
        end: new Date(String(r!.finish)).toISOString(),
      }
    },
    async usage(
      ownerId: string,
      start: string | null,
      end: string | null,
      allowanceKey: string | null,
      tx: Transaction,
    ) {
      const [storage] = await tx
        .select({ bytes: sql<number>`coalesce(sum(${subscriptionStorage.byteSize}),0)::float8` })
        .from(subscriptionStorage)
        .where(eq(subscriptionStorage.ownerId, ownerId))
      const [emails] = await tx.execute(
        sql`select coalesce(sum(recipients),0)::int n from subscription_emails where owner_id=${ownerId} and allowance_key=${allowanceKey} and queued_at>=${start}::timestamptz and queued_at<${end}::timestamptz`,
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
