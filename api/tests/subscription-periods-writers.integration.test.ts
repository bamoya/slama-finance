import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Transaction } from '../src/lib/db.js'
import { createAdminAccounts } from '../src/modules/platform/administration/index.js'
import { createBillingRepository } from '../src/modules/platform/subscriptions/repositories/billing.repository.js'
import { createSubscriptionRepository } from '../src/modules/platform/subscriptions/repositories/subscription.repository.js'
import { createBillingService } from '../src/modules/platform/subscriptions/services/billing.service.js'
import {
  compareCoverage,
  resolvePeriods,
} from '../src/modules/platform/subscriptions/services/period-resolver.service.js'
import { isolatedDatabase } from './helpers/postgres.js'

const DAY = 86_400_000

describe('S5b coverage writers (dual write)', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let billing: ReturnType<typeof createBillingService>
  let actor: { adminId: string; email: string; reason: string }
  beforeEach(async () => {
    fixture = await isolatedDatabase()
    billing = createBillingService(
      createBillingRepository(() => fixture.db),
      createSubscriptionRepository(() => fixture.db),
    )
    await createAdminAccounts(() => fixture.db).create({
      email: 'ops@example.test',
      name: 'Ops',
      password: 'admin-password-2026',
    })
    const [admin] = await fixture.client`select id from platform_admins`
    actor = { adminId: String(admin!.id), email: 'ops@example.test', reason: 'goodwill' }
  })
  afterEach(async () => {
    await fixture?.cleanup()
  })

  const asAdmin = <T>(work: (tx: Transaction) => Promise<T>) =>
    fixture.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.actor_type','platform_admin',true)`)
      return work(tx)
    })
  async function owner(trialDaysAgo = 1) {
    const id = randomUUID()
    await fixture.client`insert into platform_users(id,email,password_hash) values (${id},${`${id}@example.test`},'x')`
    await fixture.client`insert into owner_subscriptions(owner_id,plan_code,trial_started_at,trial_ends_at) values (${id},'trial',now()-${`${trialDaysAgo} days`}::interval,now()-${`${trialDaysAgo} days`}::interval+interval '7 days')`
    return id
  }
  async function pay(ownerId: string, planCode = 'essential') {
    const payment = await billing.submit(ownerId, {
      planCode: planCode as 'essential',
      cycle: 'monthly',
      method: 'cash',
      reference: `R-${randomUUID().slice(0, 8)}`,
    })
    return billing.confirm(payment.id, 'ops')
  }
  async function shadow(ownerId: string) {
    const repo = createSubscriptionRepository(() => fixture.db)
    return fixture.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.actor_type','platform_admin',true)`)
      const state = await repo.periodState(ownerId, tx)
      const coverage = state.periods.filter((p) => p.kind !== 'trial')
      const last = coverage.reduce<(typeof coverage)[number] | null>(
        (a, b) => (!a || (b.supersededAt ?? b.endsAt) >= (a.supersededAt ?? a.endsAt) ? b : a),
        null,
      )
      const diffs = []
      for (const days of [-1, 0, 1, 6, 8, 29, 31, 36, 38, 45, 60, 62, 69, 75, 100, 200]) {
        const at = new Date(Date.now() + days * DAY)
        diffs.push(
          compareCoverage(
            ownerId,
            await billing.administration.state(ownerId, tx, at),
            resolvePeriods(state, at),
            last?.kind ?? null,
            at,
          ),
        )
      }
      return diffs
    })
  }
  const unexpected = async (ownerId: string) =>
    (await shadow(ownerId)).filter((d) => d && d.expected !== 'complimentary_no_grace')
  const reconcile = async () =>
    Number((await fixture.client`select subscription_periods_reconcile() as n`)[0]!.n)

  it('mirrors the trial window, including an administrator trial extension', async () => {
    const id = await owner()
    const [trial] =
      await fixture.client`select starts_at, ends_at, source from subscription_periods where owner_id=${id} and kind='trial'`
    expect(trial!.source).toBe('trial')
    await asAdmin((tx) => billing.administration.extend(id, 5, actor, tx))
    const [extended] =
      await fixture.client`select p.ends_at, s.trial_ends_at from subscription_periods p join owner_subscriptions s using (owner_id) where p.owner_id=${id} and p.kind='trial'`
    expect(extended!.ends_at).toEqual(extended!.trial_ends_at)
    expect(await unexpected(id)).toEqual([])
  })

  it('writes paid periods on confirmation (renewal and upgrade) with zero shadow differences', async () => {
    const renewed = await owner()
    await pay(renewed)
    await pay(renewed)
    const upgraded = await owner()
    await pay(upgraded)
    await pay(upgraded, 'business')
    const periods =
      await fixture.client`select owner_id, plan_code, superseded_at is not null superseded from subscription_periods where kind='paid' order by owner_id, starts_at`
    expect(periods.filter((p) => p.owner_id === renewed).map((p) => p.superseded)).toEqual([
      false,
      false,
    ])
    expect(
      periods.filter((p) => p.owner_id === upgraded).map((p) => [p.plan_code, p.superseded]),
    ).toEqual([
      ['essential', true],
      ['business', false],
    ])
    expect(await unexpected(renewed)).toEqual([])
    expect(await unexpected(upgraded)).toEqual([])
  })

  it('creates exactly one period under concurrent double confirmation', async () => {
    const id = await owner()
    const payment = await billing.submit(id, {
      planCode: 'essential',
      cycle: 'monthly',
      method: 'bank_transfer',
      reference: 'R-double',
    })
    const results = await Promise.allSettled([
      billing.confirm(payment.id, 'ops'),
      billing.confirm(payment.id, 'ops'),
    ])
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true)
    expect(
      await fixture.client`select 1 from subscription_periods where payment_id=${payment.id}`,
    ).toHaveLength(1)
  })

  it('records grants, extensions and plan changes as complimentary periods with notes', async () => {
    const granted = randomUUID()
    await fixture.client`insert into platform_users(id,email,password_hash) values (${granted},'granted@example.test','x')`
    await asAdmin((tx) =>
      billing.administration.grant(
        granted,
        {
          planCode: 'business',
          cycle: 'monthly',
          start: new Date(Date.now() - DAY),
          end: new Date(Date.now() + 30 * DAY),
        },
        { ...actor, reason: 'signed contract' },
        tx,
      ),
    )
    const changed = await owner()
    await pay(changed)
    await asAdmin((tx) =>
      billing.administration.changePlan(changed, 'pro', { ...actor, reason: 'pilot' }, tx),
    )
    await asAdmin((tx) => billing.administration.extend(changed, 10, actor, tx))
    const notes =
      await fixture.client`select p.owner_id, n.reason, n.created_by from subscription_period_notes n join subscription_periods p on p.id=n.period_id order by p.starts_at`
    expect(notes.map((n) => n.reason)).toEqual(['signed contract', 'pilot', 'goodwill'])
    expect(notes.every((n) => n.created_by === actor.adminId)).toBe(true)
    // Dual write: every complimentary period is paired with its legacy adjustment payment.
    const pairs =
      await fixture.client`select s.method, s.coverage_start=p.starts_at and s.coverage_end=p.ends_at same from subscription_periods p left join subscription_payments s on s.id=p.payment_id where p.kind='complimentary'`
    expect(pairs).toHaveLength(3)
    expect(pairs.every((r) => r.method === 'admin_adjustment' && r.same)).toBe(true)
    // The reconciliation treats the pairs as processed: nothing appended, no refusal.
    const before =
      await fixture.client`select count(*)::int n from subscription_periods where owner_id in (${granted},${changed})`
    await reconcile()
    expect(
      await fixture.client`select count(*)::int n from subscription_periods where owner_id in (${granted},${changed})`,
    ).toEqual(before)
    for (const id of [granted, changed]) expect(await unexpected(id)).toEqual([])
  })

  it('keeps suspension history and shifts periods exactly like the legacy coverage', async () => {
    const id = await owner()
    await pay(id)
    await asAdmin((tx) => billing.administration.suspend(id, tx))
    expect(
      await fixture.client`select 1 from subscription_suspensions where owner_id=${id} and ended_at is null`,
    ).toHaveLength(1)
    // Pretend the suspension lasted three days (both histories moved; test-only trigger bypass).
    await fixture.client.begin(async (tx) => {
      await tx`set local session_replication_role = replica`
      await tx`update owner_subscriptions set suspended_at=suspended_at-interval '3 days' where owner_id=${id}`
      await tx`update subscription_suspensions set started_at=started_at-interval '3 days' where owner_id=${id} and ended_at is null`
    })
    await asAdmin((tx) => billing.administration.resume(id, tx))
    const [row] =
      await fixture.client`select ended_at is not null closed, shifted_by_ms from subscription_suspensions where owner_id=${id}`
    expect(row!.closed).toBe(true)
    expect(Math.abs(Number(row!.shifted_by_ms) - 3 * DAY)).toBeLessThan(10_000)
    const [both] =
      await fixture.client`select p.ends_at, s.coverage_end from subscription_periods p join subscription_payments s on s.id=p.payment_id where p.owner_id=${id}`
    expect(both!.ends_at).toEqual(both!.coverage_end)
    expect(await unexpected(id)).toEqual([])
  })

  it('writes cancellations with a typed owner actor, undo and renewal clear them', async () => {
    const id = await owner()
    await pay(id)
    await billing.setCancellation(id, true)
    const [scheduled] =
      await fixture.client`select created_by, actor_owner_id, effective_at from subscription_scheduled_changes where owner_id=${id} and status='scheduled'`
    expect(scheduled).toMatchObject({ created_by: 'owner', actor_owner_id: id })
    expect(await unexpected(id)).toEqual([])
    await billing.setCancellation(id, false)
    await billing.setCancellation(id, true)
    // A confirmed renewal clears the cancellation (legacy flag and scheduled change together).
    await pay(id)
    expect(await unexpected(id)).toEqual([])
    await billing.setCancellation(id, true)
    // An administrator extension moves the cancellation to the new paid-through (superseding row).
    await asAdmin((tx) => billing.administration.extend(id, 5, actor, tx))
    const rows =
      await fixture.client`select status, effective_at from subscription_scheduled_changes where owner_id=${id}`
    expect(rows.map((r) => r.status).sort()).toEqual([
      'cancelled',
      'cancelled',
      'scheduled',
      'superseded',
    ])
    const [paidThrough] =
      await fixture.client`select paid_through_at from owner_subscriptions where owner_id=${id}`
    expect(rows.find((r) => r.status === 'scheduled')!.effective_at).toEqual(
      paidThrough!.paid_through_at,
    )
    expect(await unexpected(id)).toEqual([])
  })

  it('leaves the reconciliation nothing to do for rows written by the new writers', async () => {
    const a = await owner()
    await pay(a)
    await pay(a, 'business')
    await billing.setCancellation(a, true)
    const b = await owner()
    await pay(b)
    await asAdmin((tx) => billing.administration.suspend(b, tx))
    await asAdmin((tx) => billing.administration.resume(b, tx))
    await asAdmin((tx) => billing.administration.extend(b, 7, actor, tx))
    const c = await owner(2)
    await asAdmin((tx) => billing.administration.extend(c, 3, actor, tx))
    const before = await fixture.client`select count(*)::int n from subscription_periods`
    // The fixture owner predates the writers in this database (no confirmed payments): marker only.
    await reconcile()
    const after = await fixture.client`select count(*)::int n from subscription_periods`
    expect(
      await fixture.client`select 1 from subscription_periods p where p.owner_id in (${a},${b},${c}) and p.source='migration'`,
    ).toHaveLength(0)
    expect(Number(after[0]!.n) - Number(before[0]!.n)).toBeLessThanOrEqual(1)
    expect(await reconcile()).toBe(0)
  })

  it('closes a suspension on the application clock even when the database clock lags', async () => {
    const id = await owner()
    await pay(id)
    // Application clock ahead of the database (within the guards' one-minute tolerance): the shift
    // SQL must close the suspension at start + applied shift, not at the database now().
    let at = Date.now() + 30_000
    const ahead = createBillingService(
      createBillingRepository(() => fixture.db),
      createSubscriptionRepository(() => fixture.db),
      () => new Date(at),
    )
    await asAdmin((tx) => ahead.administration.suspend(id, tx))
    at += 1_234
    await asAdmin((tx) => ahead.administration.resume(id, tx))
    const [row] =
      await fixture.client`select ended_at - started_at as window, shifted_by_ms from subscription_suspensions where owner_id=${id}`
    expect(Number(row!.shifted_by_ms)).toBe(1_234)
    expect(row!.window).toBe('00:00:01.234')
  })

  it('refuses to shift when the legacy and period suspension starts disagree', async () => {
    const id = await owner()
    await pay(id)
    await asAdmin((tx) => billing.administration.suspend(id, tx))
    await fixture.client`update owner_subscriptions set suspended_at=suspended_at-interval '1 day' where owner_id=${id}`
    await expect(asAdmin((tx) => billing.administration.resume(id, tx))).rejects.toThrow(
      /histories disagree/,
    )
    expect(
      await fixture.client`select 1 from subscription_suspensions where owner_id=${id} and ended_at is null`,
    ).toHaveLength(1)
  })

  it('lets an owner schedule only their own cancellation as themselves', async () => {
    const id = await owner()
    const other = await owner()
    await pay(id)
    const asOwner = (actorOwner: string) =>
      fixture.db.transaction(async (tx) => {
        await tx.execute(
          sql.raw(
            `grant select, insert on subscription_scheduled_changes, organizations to "${fixture.role}"`,
          ),
        )
        await tx.execute(sql.raw(`set local role "${fixture.role}"`))
        await tx.execute(
          sql`select set_config('app.organization_id','',true),set_config('app.actor_type','owner',true),set_config('app.owner_id',${id},true)`,
        )
        await tx.execute(
          sql`insert into subscription_scheduled_changes(owner_id,kind,effective_at,created_by,actor_owner_id) values (${id},'cancel',now()+interval '10 days','owner',${actorOwner})`,
        )
      })
    await expect(asOwner(other)).rejects.toThrow()
    await asOwner(id)
    expect(
      await fixture.client`select 1 from subscription_scheduled_changes where owner_id=${id}`,
    ).toHaveLength(1)
  })

  it('writes legacy rows only with SUBSCRIPTION_PERIOD_WRITES=off, which reconciliation can append later', async () => {
    const legacyOnly = createBillingService(
      createBillingRepository(() => fixture.db),
      createSubscriptionRepository(() => fixture.db),
      undefined,
      undefined,
      false,
    )
    const id = await owner()
    const payment = await legacyOnly.submit(id, {
      planCode: 'essential',
      cycle: 'monthly',
      method: 'cash',
      reference: 'R-off',
    })
    await legacyOnly.confirm(payment.id, 'ops')
    await legacyOnly.setCancellation(id, true)
    await asAdmin((tx) => legacyOnly.administration.extend(id, 4, actor, tx))
    // Legacy output identical to the dual-write service; no coverage periods besides the DB trial mirror.
    const legacyState = await asAdmin((tx) => legacyOnly.administration.state(id, tx))
    const dualState = await asAdmin((tx) => billing.administration.state(id, tx))
    expect(legacyState).toEqual(dualState)
    expect(
      await fixture.client`select kind from subscription_periods where owner_id=${id}`,
    ).toEqual([{ kind: 'trial' }])
    expect(
      await fixture.client`select 1 from subscription_scheduled_changes where owner_id=${id}`,
    ).toHaveLength(0)
    expect(
      await fixture.client`select 1 from subscription_payments where owner_id=${id} and method='admin_adjustment'`,
    ).toHaveLength(1)
    // The reconciliation appends what was skipped; then shadow shows no unexpected difference.
    await reconcile()
    expect(await unexpected(id)).toEqual([])
    expect(await reconcile()).toBe(0)
  })
})
