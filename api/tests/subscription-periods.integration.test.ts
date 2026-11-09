import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createSubscriptionsModule } from '../src/modules/platform/subscriptions/index.js'
import { createBillingRepository } from '../src/modules/platform/subscriptions/repositories/billing.repository.js'
import { createSubscriptionRepository } from '../src/modules/platform/subscriptions/repositories/subscription.repository.js'
import { createBillingService } from '../src/modules/platform/subscriptions/services/billing.service.js'
import {
  compareCoverage,
  resolvePeriods,
} from '../src/modules/platform/subscriptions/services/period-resolver.service.js'
import { isolatedDatabase } from './helpers/postgres.js'

const DAY = 86_400_000

describe('S5a coverage periods', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let base: number
  beforeEach(async () => {
    fixture = await isolatedDatabase()
    const [row] = await fixture.client`select extract(epoch from now())*1000 as ms`
    base = Math.floor(Number(row!.ms) / 1000) * 1000
    // These cases model data written before 0003 (legacy writers only): no S5b trial mirror.
    await fixture.client`alter table owner_subscriptions disable trigger owner_subscription_trial_period`
  })
  afterEach(async () => {
    await fixture?.cleanup()
  })

  const iso = (days: number) => new Date(base + days * DAY).toISOString()
  async function owner(
    shape: {
      plan?: string
      paidThrough?: number
      cancel?: boolean
      suspendedDaysAgo?: number
      trialStart?: number
    } = {},
  ) {
    const id = randomUUID()
    await fixture.client`insert into platform_users(id,email,password_hash) values (${id},${`${id}@example.test`},'x')`
    const start = iso(shape.trialStart ?? -30)
    await fixture.client`insert into owner_subscriptions(owner_id,plan_code,trial_started_at,trial_ends_at,paid_through_at,cancel_at_period_end,suspended_at)
      values (${id},${shape.plan ?? 'trial'},${start},${start}::timestamptz+interval '7 days',${shape.paidThrough === undefined ? null : iso(shape.paidThrough)},${shape.cancel ?? false},${shape.suspendedDaysAgo === undefined ? null : iso(-shape.suspendedDaysAgo)})`
    return id
  }
  async function payment(
    ownerId: string,
    from: number,
    to: number,
    over: { plan?: string; amount?: number; method?: string } = {},
  ) {
    const amount = over.amount ?? 9900
    const [row] =
      await fixture.client`insert into subscription_payments(owner_id,plan_code,cycle,kind,status,method,reference,currency,amount_ht,tax_amount,amount_ttc,coverage_start,coverage_end,decided_at,decided_by)
      values (${ownerId},${over.plan ?? 'essential'},'monthly','activation','confirmed',${over.method ?? 'cash'},'R','MAD',${amount},0,${amount},${iso(from)},${iso(to)},now(),'ops') returning id`
    return String(row!.id)
  }
  const backfill = () => fixture.client`select subscription_periods_reconcile() as n`
  const billing = () =>
    createBillingService(
      createBillingRepository(() => fixture.db),
      createSubscriptionRepository(() => fixture.db),
    )
  async function compareAt(ownerId: string, days: number[]) {
    const repo = createSubscriptionRepository(() => fixture.db)
    const legacy = billing()
    return fixture.db.transaction(async (tx) =>
      Promise.all(
        days.map(async (d) => {
          const at = new Date(base + d * DAY)
          const state = await repo.periodState(ownerId, tx)
          const coverage = state.periods.filter((p) => p.kind !== 'trial')
          const last = coverage.reduce<(typeof coverage)[number] | null>(
            (a, b) => (!a || (b.supersededAt ?? b.endsAt) >= (a.supersededAt ?? a.endsAt) ? b : a),
            null,
          )
          return compareCoverage(
            ownerId,
            await legacy.administration.state(ownerId, tx, at),
            resolvePeriods(state, at),
            last?.kind ?? null,
            at,
          )
        }),
      ),
    )
  }
  const instants = [-25, -1, 0, 6, 14, 19, 21, 26, 28, 49, 51, 58, 120, 400]

  it('backfills production-shaped subscriptions with the same coverage at every instant', async () => {
    const trialOnly = await owner({ trialStart: -2 })
    const paid = await owner({ plan: 'essential', paidThrough: 50 })
    await payment(paid, -10, 20)
    await payment(paid, 20, 50, { plan: 'business' })
    const adjusted = await owner({ plan: 'business', paidThrough: 25 })
    const adjustment = await payment(adjusted, -5, 25, {
      plan: 'business',
      amount: 0,
      method: 'admin_adjustment',
    })
    const marker = await owner({ plan: 'business', paidThrough: 15 })
    const cancelled = await owner({ plan: 'essential', paidThrough: 20, cancel: true })
    await payment(cancelled, -10, 20)
    const suspended = await owner({ plan: 'essential', paidThrough: 20, suspendedDaysAgo: 3 })
    await payment(suspended, -10, 20)
    const upgraded = await owner({ plan: 'business', paidThrough: 20 })
    await payment(upgraded, -10, 20)
    await payment(upgraded, -2, 20, { plan: 'business' })
    const before = await fixture.client`select * from subscription_payments order by id`
    const subscriptionsBefore =
      await fixture.client`select * from owner_subscriptions order by owner_id`

    expect(Number((await backfill())[0]!.n)).toBeGreaterThanOrEqual(7)
    // Legacy rows are untouched; a second run adds nothing.
    expect(await fixture.client`select * from subscription_payments order by id`).toEqual(before)
    expect(await fixture.client`select * from owner_subscriptions order by owner_id`).toEqual(
      subscriptionsBefore,
    )
    const count = await fixture.client`select count(*)::int n from subscription_periods`
    expect(Number((await backfill())[0]!.n)).toBe(0)
    expect(await fixture.client`select count(*)::int n from subscription_periods`).toEqual(count)
    // Existing tests run as the fixture's connection user (the test database superuser): see
    // the non-superuser migration-role test below for the row-level security path.

    for (const id of [trialOnly, paid, cancelled, suspended, upgraded])
      expect(await compareAt(id, instants), id).toEqual(instants.map(() => null))
    // Approved change: complimentary coverage (converted adjustments and markers) has no grace.
    for (const id of [adjusted, marker])
      for (const diff of await compareAt(id, instants))
        expect(diff === null || diff.expected === 'complimentary_no_grace', id).toBe(true)

    const [note] =
      await fixture.client`select n.reason from subscription_period_notes n join subscription_periods p on p.id=n.period_id where p.payment_id=${adjustment}`
    expect(note!.reason).toContain(adjustment)
    const [superseded] =
      await fixture.client`select superseded_at from subscription_periods where owner_id=${upgraded} and plan_code='essential'`
    expect(new Date(superseded!.superseded_at as string).toISOString()).toBe(iso(-2))
    expect(
      await fixture.client`select 1 from subscription_scheduled_changes where owner_id=${cancelled} and kind='cancel' and status='scheduled'`,
    ).toHaveLength(1)
    expect(
      await fixture.client`select 1 from subscription_suspensions where owner_id=${suspended} and ended_at is null`,
    ).toHaveLength(1)
  })

  it('aborts with the owner id on shapes it cannot map without guessing', async () => {
    const cases: [string, () => Promise<string>, RegExp][] = [
      [
        'zero-amount payment',
        async () => {
          const id = await owner({ plan: 'essential' })
          await payment(id, -1, 29, { amount: 0 })
          return id
        },
        /zero-amount/,
      ],
      [
        'same start',
        async () => {
          const id = await owner({ plan: 'essential' })
          await payment(id, -1, 29)
          await payment(id, -1, 40)
          return id
        },
        /ambiguous overlapping/,
      ],
      [
        'shorter overlap',
        async () => {
          const id = await owner({ plan: 'essential' })
          await payment(id, -1, 29)
          await payment(id, 5, 10)
          return id
        },
        /ambiguous overlapping/,
      ],
      ['future suspension', async () => owner({ suspendedDaysAgo: -2 }), /future/],
    ]
    for (const [name, seed, message] of cases) {
      const id = await seed()
      await expect(backfill(), name).rejects.toThrow(message)
      await expect(backfill(), name).rejects.toThrow(id)
      await fixture.client`delete from subscription_payments where owner_id=${id}`
      await fixture.client`delete from owner_subscriptions where owner_id=${id}`
      expect(
        await fixture.client`select 1 from subscription_periods where owner_id=${id}`,
      ).toHaveLength(0)
    }
    const orphan = randomUUID()
    await fixture.client`insert into platform_users(id,email,password_hash) values (${orphan},'orphan@example.test','x')`
    await payment(orphan, -1, 29)
    await expect(backfill()).rejects.toThrow(orphan)
  })

  it('enforces append-only, non-overlapping, noted and read-committed periods', async () => {
    const id = await owner({ plan: 'essential', cancel: true, suspendedDaysAgo: 1 })
    await payment(id, -10, 20)
    await backfill()
    const [p] =
      await fixture.client`select id from subscription_periods where owner_id=${id} and kind='paid'`
    await expect(
      fixture.client`delete from subscription_periods where id=${p!.id}`,
    ).rejects.toThrow(/append-only/)
    // Truncation is refused (by the guard, or earlier by the referencing foreign keys).
    await expect(fixture.client`truncate subscription_periods`).rejects.toThrow()
    await expect(fixture.client`truncate subscription_periods cascade`).rejects.toThrow(
      /append-only/,
    )
    await expect(fixture.client`truncate subscription_suspensions`).rejects.toThrow(/append-only/)
    // Window moves are reserved to the controlled functions (table owner); the runtime role may not.
    await fixture.client.unsafe(`grant select, update on subscription_periods to "${fixture.role}"`)
    await expect(
      fixture.client.begin(async (tx) => {
        await tx.unsafe(`set local role "${fixture.role}"`)
        await tx`select set_config('app.actor_type','platform_admin',true)`
        await tx`update subscription_periods set ends_at=ends_at+interval '1 day' where id=${p!.id}`
      }),
    ).rejects.toThrow(/single supersession/)
    const insert = (from: number, to: number, kind = 'complimentary') =>
      fixture.client`insert into subscription_periods(owner_id,kind,plan_code,starts_at,ends_at,source) values (${id},${kind},'business',${iso(from)},${iso(to)},'admin_grant') returning id`
    // Overlap and missing note are checked at commit.
    await expect(
      fixture.client.begin(async (tx) => {
        const [row] =
          await tx`insert into subscription_periods(owner_id,kind,plan_code,starts_at,ends_at,source) values (${id},'complimentary','business',${iso(5)},${iso(30)},'admin_grant') returning id`
        await tx`insert into subscription_period_notes(period_id,reason) values (${row!.id},'grant')`
      }),
    ).rejects.toThrow(/overlap/)
    await expect(insert(20, 40)).rejects.toThrow(/administrator note/)
    await fixture.client.begin(async (tx) => {
      const [row] =
        await tx`insert into subscription_periods(owner_id,kind,plan_code,starts_at,ends_at,source) values (${id},'complimentary','business',${iso(20)},${iso(40)},'admin_grant') returning id`
      await tx`insert into subscription_period_notes(period_id,reason) values (${row!.id},'adjacent grant')`
    })
    await expect(
      fixture.client.begin(async (tx) => {
        await tx.unsafe('set transaction isolation level repeatable read')
        await tx`insert into subscription_periods(owner_id,kind,plan_code,starts_at,ends_at,source) values (${id},'complimentary','business',${iso(50)},${iso(60)},'admin_grant')`
      }),
    ).rejects.toThrow(/READ COMMITTED/)
    await expect(
      fixture.client`insert into subscription_periods(owner_id,kind,plan_code,starts_at,ends_at,source,created_at) values (${id},'trial','trial',${iso(0)},${iso(7)},'trial',now()-interval '1 day')`,
    ).rejects.toThrow()
    await expect(fixture.client`update subscription_period_notes set reason='x'`).rejects.toThrow(
      /immutable/,
    )
    await expect(fixture.client`delete from subscription_suspensions`).rejects.toThrow(
      /append-only/,
    )
    await expect(fixture.client`delete from subscription_scheduled_changes`).rejects.toThrow(
      /append-only/,
    )
  })

  it('limits reads to the owner scope and keeps notes administrator-only', async () => {
    const a = await owner({ plan: 'business', paidThrough: 15 })
    const b = await owner({ plan: 'essential' })
    await backfill()
    const read = (table: string, settings: string) =>
      fixture.db.transaction(async (tx) => {
        await tx.execute(sql.raw(`grant select on ${table}, organizations to "${fixture.role}"`))
        await tx.execute(sql.raw(`set local role "${fixture.role}"`))
        await tx.execute(sql`select set_config('app.organization_id','',true)`)
        await tx.execute(sql.raw(settings))
        return (
          await tx.execute(
            sql.raw(
              `select 1 from ${table} x join subscription_periods p on p.id=${table === 'subscription_period_notes' ? 'x.period_id' : 'x.id'} where p.owner_id='${a}'`,
            ),
          )
        ).length
      })
    const asOwner = (id: string) =>
      `select set_config('app.actor_type','owner',true),set_config('app.owner_id','${id}',true)`
    await fixture.client.unsafe(`grant select on subscription_periods to "${fixture.role}"`)
    expect(await read('subscription_periods', asOwner(a))).toBe(2)
    expect(await read('subscription_periods', asOwner(b))).toBe(0)
    expect(await read('subscription_period_notes', asOwner(a))).toBe(0)
    expect(
      await read(
        'subscription_period_notes',
        `select set_config('app.actor_type','platform_admin',true)`,
      ),
    ).toBe(1)
  })

  it('runs the period resolver in shadow mode without changing summaries', async () => {
    const id = await owner({ plan: 'essential', paidThrough: 20 })
    await payment(id, -10, 20)
    await backfill()
    const logged: unknown[] = []
    const subscriptions = createSubscriptionsModule(() => fixture.db, {
      onShadowDiff: (diff) => logged.push(diff),
    }).publicApi
    const summary = await subscriptions.summary(id)
    expect(summary.status).toBe('active')
    expect(subscriptions.coverageShadow()).toMatchObject({ compared: 1, differing: 0 })
    expect((await subscriptions.resolvePeriods(id)).status).toBe('active')
    // An owner whose periods disagree (none backfilled) is reported, never failed.
    const fresh = await owner({ plan: 'essential', paidThrough: 20 })
    await payment(fresh, -10, 20)
    expect((await subscriptions.summary(fresh)).status).toBe('active')
    const shadow = subscriptions.coverageShadow()
    expect(shadow).toMatchObject({ compared: 2, differing: 1, unexpected: 1 })
    expect(shadow.recent[0]!.ownerId).toBe(fresh)
    // The same difference is logged once per owner; counters keep counting.
    await subscriptions.summary(fresh)
    await subscriptions.summary(fresh)
    expect(logged).toHaveLength(1)
    expect(subscriptions.coverageShadow()).toMatchObject({ compared: 4, differing: 3 })
  })

  it('runs as a non-superuser, non-BYPASSRLS table owner and refuses to commit when rows are hidden', async () => {
    const [who] =
      await fixture.client`select rolsuper, rolbypassrls from pg_roles where rolname=${fixture.role}`
    expect(who).toEqual({ rolsuper: false, rolbypassrls: false })
    const paidOwner = await owner({ plan: 'essential', paidThrough: 20 })
    await payment(paidOwner, -10, 20)
    const [schema] = await fixture.client`select current_schema() name`
    const name = String(schema!.name)
    const role = `"${fixture.role}"`
    // Mirror the migration role: owns the legacy and period tables, no superuser/BYPASSRLS.
    // No DDL is needed by the reconciliation itself (FORCE RLS stays on).
    const owned = [
      'owner_subscriptions',
      'subscription_payments',
      'subscription_periods',
      'subscription_period_notes',
      'subscription_suspensions',
      'subscription_scheduled_changes',
    ]
    for (const table of owned)
      await fixture.client.unsafe(`alter table "${name}".${table} owner to ${role}`)
    await fixture.client.unsafe(`grant select on all tables in schema "${name}" to ${role}`)
    await fixture.client.unsafe(
      `grant execute on function "${name}".subscription_periods_reconcile(text) to ${role}`,
    )
    const asMigrationRole = (call: string) =>
      fixture.client.begin(async (tx) => {
        await tx.unsafe(`set local role ${role}`)
        return tx.unsafe(call)
      })
    try {
      // Without the administrator actor FORCE RLS hides every legacy row: loud failure, nothing committed.
      await expect(asMigrationRole(`select subscription_periods_reconcile('')`)).rejects.toThrow(
        /must be read as platform administrator/,
      )
      expect(
        await fixture.client`select 1 from subscription_periods where owner_id=${paidOwner}`,
      ).toHaveLength(0)
      // With it, rows are visible and periods are created.
      const [result] = await asMigrationRole(`select subscription_periods_reconcile() as n`)
      expect(Number(result!.n)).toBeGreaterThanOrEqual(2)
      expect(
        (
          await fixture.client`select kind from subscription_periods where owner_id=${paidOwner} order by starts_at`
        ).map((r) => r.kind),
      ).toEqual(['trial', 'paid'])
      const [force] =
        await fixture.client`select relforcerowsecurity from pg_class where oid='owner_subscriptions'::regclass`
      expect(force!.relforcerowsecurity).toBe(true)
    } finally {
      const [user] = await fixture.client`select current_user name`
      for (const table of owned)
        await fixture.client.unsafe(`alter table "${name}".${table} owner to "${user!.name}"`)
    }
  })

  it('reconciles legacy changes made after the backfill, forward only', async () => {
    const id = await owner({ plan: 'essential', paidThrough: 20 })
    await payment(id, -10, 20)
    await backfill()
    // Renewal and cancellation recorded by the legacy writers after 0003.
    await payment(id, 20, 50, { plan: 'business' })
    await fixture.client`update owner_subscriptions set cancel_at_period_end=true where owner_id=${id}`
    expect(Number((await backfill())[0]!.n)).toBe(1)
    expect(await compareAt(id, instants)).toEqual(instants.map(() => null))
    // Undoing the cancellation is a status transition, never a deletion.
    await fixture.client`update owner_subscriptions set cancel_at_period_end=false where owner_id=${id}`
    await backfill()
    expect(
      (
        await fixture.client`select status from subscription_scheduled_changes where owner_id=${id}`
      ).map((r) => r.status),
    ).toEqual(['cancelled'])
    expect(await compareAt(id, instants)).toEqual(instants.map(() => null))
    expect(Number((await backfill())[0]!.n)).toBe(0)
    // A legacy resume shifted payment coverage: refused, not guessed.
    await fixture.client`update subscription_payments set coverage_end=coverage_end+interval '3 days' where owner_id=${id} and plan_code='business'`
    await expect(backfill()).rejects.toThrow(new RegExp(`coverage of payment .* changed .*${id}`))
  })

  it('waits for a concurrent legacy writer and builds from the state it committed', async () => {
    const id = await owner({ plan: 'essential', paidThrough: 20, suspendedDaysAgo: 2 })
    await payment(id, -10, 20)
    // A legacy resume holds the owner lock while it shifts coverage and clears the suspension.
    let release!: () => void
    const released = new Promise<void>((resolve) => (release = resolve))
    let locked!: () => void
    const isLocked = new Promise<void>((resolve) => (locked = resolve))
    const writer = fixture.client.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtextextended(${id},44032))`
      await tx`update subscription_payments set coverage_end=coverage_end+interval '2 days' where owner_id=${id}`
      await tx`update owner_subscriptions set suspended_at=null where owner_id=${id}`
      locked()
      await released
    })
    await isLocked
    // postgres.js queries are lazy: execute() starts it now.
    const reconcile = backfill().execute()
    // Proceed only once the reconciliation is waiting on the owner lock.
    await expect
      .poll(
        async () =>
          (
            await fixture.client`select 1 from pg_stat_activity where wait_event_type='Lock' and wait_event='advisory' and query like '%subscription_periods_reconcile%'`
          ).length,
        { timeout: 5000 },
      )
      .toBe(1)
    release()
    await writer
    await reconcile
    expect(
      await fixture.client`select 1 from subscription_suspensions where owner_id=${id}`,
    ).toHaveLength(0)
    const [period] =
      await fixture.client`select ends_at from subscription_periods where owner_id=${id} and kind='paid'`
    expect(new Date(period!.ends_at as string).toISOString()).toBe(iso(22))
    expect(await compareAt(id, instants)).toEqual(instants.map(() => null))
    // Later runs accept the result (no permanent refusal).
    expect(Number((await backfill())[0]!.n)).toBe(0)
  })
})
