import { randomUUID } from 'node:crypto'

import { type SQL, sql } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { subscriptionPeriods } from '../db/schema/subscription-periods.js'
import { ownerSubscriptions } from '../db/schema/subscriptions.js'
import type { Database, Transaction } from '../src/lib/db.js'
import { createAdminAccounts } from '../src/modules/platform/administration/index.js'
import { createBillingRepository } from '../src/modules/platform/subscriptions/repositories/billing.repository.js'
import type { CoverageReads } from '../src/modules/platform/subscriptions/repositories/coverage-lifecycle.repository.js'
import { createSubscriptionRepository } from '../src/modules/platform/subscriptions/repositories/subscription.repository.js'
import { createBillingService } from '../src/modules/platform/subscriptions/services/billing.service.js'
import { billingDay } from '../src/modules/platform/subscriptions/services/billing-calendar.service.js'
import { createSubscriptionService } from '../src/modules/platform/subscriptions/services/subscription.service.js'
import { isolatedDatabase, testOwnerId } from './helpers/postgres.js'

const DAY = 86_400_000

/**
 * Database whose reader transactions commit `write` (on another connection) right after their first
 * query reading `table` returns: a controlled read boundary at READ COMMITTED. Any later statement of
 * the reader sees the write; one-statement snapshots do not.
 */
function interleaved(db: Database, table: PgTable, write: () => Promise<unknown>) {
  let pending: (() => Promise<unknown>) | undefined = write
  const fire = async () => {
    const run = pending
    pending = undefined
    if (run) await run()
  }
  const wrap = (tx: Transaction): Transaction =>
    new Proxy(tx, {
      get(target, property) {
        if (property === 'execute')
          return async (query: SQL) => {
            const result = await target.execute(query)
            if (query.queryChunks.includes(table)) await fire()
            return result
          }
        if (property === 'select')
          return (...args: Parameters<Transaction['select']>) => {
            const builder = target.select(...args)
            const from = builder.from.bind(builder)
            builder.from = ((source: PgTable) => {
              const query = from(source)
              if (source !== table) return query
              const then = query.then.bind(query)
              query.then = ((ok, ko) =>
                then(async (rows) => {
                  await fire()
                  return rows
                }).then(ok, ko)) as typeof query.then
              return query
            }) as typeof builder.from
            return builder
          }
        if (property === 'transaction')
          return (work: (sp: Transaction) => Promise<unknown>) =>
            target.transaction((sp) => work(wrap(sp)))
        const value = Reflect.get(target, property, target) as unknown
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
  return new Proxy(db, {
    get(target, property) {
      if (property === 'transaction')
        return (work: (tx: Transaction) => Promise<unknown>) =>
          target.transaction((tx) => work(wrap(tx)))
      const value = Reflect.get(target, property, target) as unknown
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

describe('S2/S4 resolver snapshot at the read boundary', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let actor: { adminId: string; email: string; reason: string }
  let at: number
  const clock = () => new Date(at)

  const setup = async (owner: 'paid' | 'trial') => {
    fixture = await isolatedDatabase({ owner })
    at = Date.now()
    await createAdminAccounts(() => fixture.db).create({
      email: 'ops@example.test',
      name: 'Ops',
      password: 'admin-password-2026',
    })
    const [admin] = await fixture.client`select id from platform_admins`
    actor = { adminId: String(admin!.id), email: 'ops@example.test', reason: 'goodwill' }
  }
  afterEach(async () => {
    await fixture?.cleanup()
  })

  const billingFor = (reads: CoverageReads) =>
    createBillingService(
      createBillingRepository(() => fixture.db),
      createSubscriptionRepository(() => fixture.db),
      clock,
      () => {},
      true,
      reads,
    )
  const reader = (reads: CoverageReads, database: () => Database = () => fixture.db) =>
    createSubscriptionService(
      createSubscriptionRepository(database),
      createBillingRepository(database),
      clock,
      () => {},
      () => {},
      true,
      reads,
    )
  const asAdmin = <T>(work: (tx: Transaction) => Promise<T>) =>
    fixture.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.actor_type','platform_admin',true)`)
      return work(tx)
    })

  describe('trial', () => {
    beforeEach(() => setup('trial'))

    it('does not mix an expired trial period with a concurrently extended trial row', async () => {
      await fixture.client`update owner_subscriptions set trial_started_at=now()-interval '10 days',trial_ends_at=now()-interval '3 days' where owner_id=${testOwnerId}`
      const before = await reader('periods').summary(testOwnerId)
      expect(before.status).toBe('expired')
      const db = interleaved(fixture.db, subscriptionPeriods, () =>
        asAdmin((tx) => billingFor('periods').administration.extend(testOwnerId, 5, actor, tx)),
      )
      expect(await reader('periods', () => db).summary(testOwnerId)).toEqual(before)
      const after = await reader('periods').summary(testOwnerId)
      expect(after.status).toBe('trial')
      expect(Date.parse(after.trialEndsAt!)).toBeGreaterThan(at)
    })

    it('sees a concurrent first trial creation entirely or not at all (no false 503)', async () => {
      const owner = randomUUID()
      await fixture.client`insert into platform_users(id,email,password_hash) values (${owner},${`${owner}@example.test`},'x')`
      const before = await reader('periods').summary(owner)
      expect(before.status).toBe('not_started')
      const repo = createSubscriptionRepository(() => fixture.db)
      const db = interleaved(fixture.db, subscriptionPeriods, () =>
        repo.owner(owner, (tx) => repo.start(owner, tx)),
      )
      expect(await reader('periods', () => db).summary(owner)).toEqual(before)
      expect((await reader('periods').summary(owner)).status).toBe('trial')
    })
  })

  describe('legacy', () => {
    beforeEach(() => setup('paid'))

    it('does not mix a suspended subscription row with concurrently resumed payment coverage', async () => {
      const billing = billingFor('legacy')
      await asAdmin((tx) => billing.administration.suspend(testOwnerId, tx))
      const since = new Date(Date.now() - 5 * DAY).toISOString()
      await fixture.client.begin(async (tx) => {
        await tx`set local session_replication_role=replica`
        await tx`update subscription_suspensions set started_at=${since} where owner_id=${testOwnerId} and ended_at is null`
        await tx`update owner_subscriptions set suspended_at=${since} where owner_id=${testOwnerId}`
      })
      const before = await reader('legacy').summary(testOwnerId)
      expect(before.status).toBe('suspended')
      const db = interleaved(fixture.db, ownerSubscriptions, () =>
        asAdmin((tx) => billing.administration.resume(testOwnerId, tx)),
      )
      expect(await reader('legacy', () => db).summary(testOwnerId)).toEqual(before)
      const after = await reader('legacy').summary(testOwnerId)
      expect(after.status).toBe('active')
      expect(Date.parse(after.paidThroughAt!)).toBeGreaterThan(Date.parse(before.paidThroughAt!))
    })
  })

  describe('one authoritative clock for writers and resolution', () => {
    beforeEach(() => setup('trial'))
    afterEach(() => vi.useRealTimers())

    // Production wiring (no injected clock) with the application host 10 minutes ahead of the database.
    const production = () => {
      const repo = createSubscriptionRepository(() => fixture.db),
        billingRepo = createBillingRepository(() => fixture.db)
      return {
        billing: createBillingService(billingRepo, repo),
        subscriptions: createSubscriptionService(repo, billingRepo),
      }
    }
    const skewHost = () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(Date.now() + 10 * 60_000)
    }

    it('resolves an administrator activation as active despite host/database drift', async () => {
      const { billing, subscriptions } = production()
      const [{ today } = { today: new Date() }] = await fixture.client<
        { today: Date }[]
      >`select now() as today`
      skewHost()
      const startsOn = billingDay(new Date(today))
      const endsOn = billingDay(new Date(new Date(today).getTime() + 30 * DAY))
      await asAdmin((tx) =>
        billing.administration.activate(
          testOwnerId,
          {
            planCode: 'business',
            cycle: 'monthly',
            startsOn,
            endsOn,
            settlement: { kind: 'payment', method: 'bank_transfer', reference: 'VIR-1' },
          },
          actor,
          tx,
        ),
      )
      expect(await subscriptions.summary(testOwnerId)).toMatchObject({
        status: 'active',
        planCode: 'business',
      })
      const [payment] =
        await fixture.client`select coverage_start, decided_at, submitted_at, now() db from subscription_payments where owner_id=${testOwnerId}`
      // Stamped on the database clock, never the drifting host clock.
      expect(new Date(payment!.coverage_start).getTime()).toBeLessThanOrEqual(
        new Date(payment!.db).getTime(),
      )
      expect(new Date(payment!.decided_at).getTime()).toBe(
        new Date(payment!.coverage_start).getTime(),
      )
    })

    it('resolves a confirmed payment and an administrator plan change on the same clock', async () => {
      const { billing, subscriptions } = production()
      skewHost()
      const submitted = await billing.submit(testOwnerId, {
        planCode: 'pro',
        cycle: 'monthly',
        method: 'cash',
        reference: 'R-1',
      })
      await billing.confirm(submitted.id, 'ops')
      expect(await subscriptions.summary(testOwnerId)).toMatchObject({
        status: 'active',
        planCode: 'pro',
      })
      await asAdmin((tx) => billing.administration.changePlan(testOwnerId, 'essential', actor, tx))
      expect((await subscriptions.summary(testOwnerId)).planCode).toBe('essential')
    })
  })
})
