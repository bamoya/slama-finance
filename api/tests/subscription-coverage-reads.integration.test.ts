import { randomBytes, randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/env.js'
import type { Transaction } from '../src/lib/db.js'
import { tenantDatabase } from '../src/lib/tenant-database.js'
import { createTenantWorkerRunner } from '../src/lib/tenant-workers.js'
import { base32Decode, totp } from '../src/lib/totp.js'
import { createAdminAccounts } from '../src/modules/platform/administration/index.js'
import { createBillingRepository } from '../src/modules/platform/subscriptions/repositories/billing.repository.js'
import {
  coverageLifecycleSql,
  type CoverageReads,
} from '../src/modules/platform/subscriptions/repositories/coverage-lifecycle.repository.js'
import { createSubscriptionRepository } from '../src/modules/platform/subscriptions/repositories/subscription.repository.js'
import { createBillingService } from '../src/modules/platform/subscriptions/services/billing.service.js'
import { createSubscriptionService } from '../src/modules/platform/subscriptions/services/subscription.service.js'
import { attachTestDatabase, isolatedDatabase } from './helpers/postgres.js'

const DAY = 86_400_000

describe('S5c coverage read authority', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let actor: { adminId: string; email: string; reason: string }
  let at: number
  const clock = () => new Date(at)
  beforeEach(async () => {
    fixture = await isolatedDatabase()
    at = Date.now()
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

  const services = (reads: CoverageReads) => {
    const repo = createSubscriptionRepository(() => fixture.db),
      billingRepo = createBillingRepository(() => fixture.db)
    return {
      billing: createBillingService(billingRepo, repo, clock, () => {}, true, reads),
      subscriptions: createSubscriptionService(
        repo,
        billingRepo,
        clock,
        () => {},
        () => {},
        true,
        reads,
      ),
    }
  }
  const asAdmin = <T>(work: (tx: Transaction) => Promise<T>) =>
    fixture.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.actor_type','platform_admin',true)`)
      return work(tx)
    })
  // Fixture-only passage of time: resume still runs under the real database clock and all guards.
  async function backdateSuspension(ownerId: string, startedAt: number) {
    await fixture.client.begin(async (tx) => {
      await tx`set local session_replication_role=replica`
      await tx`update subscription_suspensions set started_at=${new Date(startedAt).toISOString()} where owner_id=${ownerId} and ended_at is null`
      await tx`update owner_subscriptions set suspended_at=${new Date(startedAt).toISOString()} where owner_id=${ownerId}`
    })
  }

  // Seed an exact historical boundary independently of inverse month clipping/DST arithmetic.
  async function seedPaidEnd(ownerId: string, endsAt: number) {
    const end = new Date(endsAt).toISOString()
    await fixture.client.begin(async (tx) => {
      await tx`set local session_replication_role=replica`
      await tx`update subscription_payments set coverage_end=${end} where owner_id=${ownerId} and status='confirmed'`
      await tx`update subscription_periods set ends_at=${end} where owner_id=${ownerId} and kind='paid'`
      await tx`update owner_subscriptions set paid_through_at=${end} where owner_id=${ownerId}`
    })
  }

  /** Owner with an activated organization, trial ended `trialDaysAgo` days ago (periods mirrored). */
  async function owner(trialEndedDaysAgo = 23) {
    const id = randomUUID(),
      organization = randomUUID()
    await fixture.client`insert into platform_users(id,email,password_hash) values (${id},${`${id}@example.test`},'x')`
    await fixture.client`insert into owner_subscriptions(owner_id,plan_code,trial_started_at,trial_ends_at) values (${id},'trial',now()-${`${trialEndedDaysAgo + 7} days`}::interval,now()-${`${trialEndedDaysAgo} days`}::interval)`
    await fixture.client`insert into organizations(id,owner_id,name,slug,activated_at) values (${organization},${id},'Org',${`org-${organization.slice(0, 8)}`},now())`
    return { id, organization }
  }
  async function pay(billing: ReturnType<typeof services>['billing'], ownerId: string) {
    const payment = await billing.submit(ownerId, {
      planCode: 'essential',
      cycle: 'monthly',
      method: 'cash',
      reference: `R-${randomUUID().slice(0, 8)}`,
    })
    return billing.confirm(payment.id, 'ops')
  }
  const adminStatus = (reads: CoverageReads, ownerId: string) =>
    asAdmin(async (tx) => {
      const rows = await tx.execute<{ status: string }>(
        sql`select status from (${coverageLifecycleSql(reads)(sql`${clock().toISOString()}::timestamptz`)}) l where owner_id=${ownerId}`,
      )
      return rows[0]?.status
    })
  /** API admission, worker eligibility (featureless) and administrator SQL at the same instant. */
  async function decisions(reads: CoverageReads, o: { id: string; organization: string }) {
    const { subscriptions } = services(reads)
    const scoped = tenantDatabase(fixture.db, o.organization)
    const summary = await subscriptions.summary(o.id)
    const access = await scoped
      .transaction((tx) => subscriptions.assertAccess(tx))
      .then(
        () => 'allowed',
        (error: { code?: string }) => error.code,
      )
    const visited: string[] = []
    await createTenantWorkerRunner(
      () => fixture.db,
      (feature) => scoped.transaction((tx) => subscriptions.workerEligible(tx, feature)),
    )(async (id) => {
      if (id === o.organization) visited.push(id)
    })
    return {
      status: summary.status,
      graceEndsAt: summary.graceEndsAt,
      access,
      worker: visited.length === 1,
      admin: await adminStatus(reads, o.id),
    }
  }

  it('ends complimentary coverage without grace everywhere, legacy rollback unchanged', async () => {
    const o = await owner()
    const { billing } = services('periods')
    const paid = await pay(billing, o.id)
    // Complimentary extension adjacent to the paid period: the latest coverage is free.
    await asAdmin((tx) => billing.administration.extend(o.id, 3, actor, tx))
    at = new Date(paid.coverageEnd!).getTime() + 2 * DAY
    expect(await decisions('periods', o)).toEqual({
      status: 'active',
      graceEndsAt: null,
      access: 'allowed',
      worker: true,
      admin: 'active',
    })
    at += 3 * DAY
    expect(await decisions('periods', o)).toEqual({
      status: 'expired',
      graceEndsAt: null,
      access: 'SUBSCRIPTION_EXPIRED',
      worker: false,
      admin: 'expired',
    })
    // Explicit legacy rollback keeps the former complimentary grace.
    expect(await decisions('legacy', o)).toMatchObject({
      status: 'past_due',
      access: 'allowed',
      worker: true,
      admin: 'past_due',
    })
  })

  it('never backdates a payment confirmed after a complimentary grant lapsed', async () => {
    const o = await owner()
    const { billing } = services('periods')
    const paid = await pay(billing, o.id)
    await asAdmin((tx) => billing.administration.extend(o.id, 3, actor, tx))
    // Within the legacy seven-day grace of the free extension, but the free coverage has lapsed.
    at = new Date(paid.coverageEnd!).getTime() + 5 * DAY
    expect(
      (await services('legacy').billing.quote(o.id, { planCode: 'essential', cycle: 'monthly' }))
        .kind,
    ).toBe('renewal')
    const payment = await pay(billing, o.id)
    expect(payment.kind).toBe('activation')
    expect(new Date(payment.coverageStart!).getTime()).toBe(at)
    expect((await decisions('periods', o)).status).toBe('active')
  })

  it('keeps the seven-day paid grace and continuation for paid coverage', async () => {
    const o = await owner()
    const { billing } = services('periods')
    const first = await pay(billing, o.id)
    const end = new Date(first.coverageEnd!).getTime()
    at = end + 2 * DAY
    expect(await decisions('periods', o)).toEqual({
      status: 'past_due',
      graceEndsAt: new Date(end + 7 * DAY).toISOString(),
      access: 'allowed',
      worker: true,
      admin: 'past_due',
    })
    const renewal = await pay(billing, o.id)
    expect(renewal.kind).toBe('renewal')
    expect(new Date(renewal.coverageStart!).getTime()).toBe(end)
  })

  it('agrees on suspension and on a scheduled cancellation', async () => {
    const o = await owner(),
      other = await owner()
    const { billing } = services('periods')
    await pay(billing, other.id)
    await asAdmin((tx) => billing.administration.suspend(other.id, tx))
    expect(await decisions('periods', other)).toMatchObject({
      status: 'suspended',
      access: 'ORGANIZATION_SUSPENDED',
      worker: false,
      admin: 'suspended',
    })
    const paid = await pay(billing, o.id)
    await billing.setCancellation(o.id, true)
    at = new Date(paid.coverageEnd!).getTime() + DAY
    expect(await decisions('periods', o)).toMatchObject({
      status: 'expired',
      access: 'SUBSCRIPTION_EXPIRED',
      worker: false,
      admin: 'expired',
    })
  })

  it('fails closed when a started subscription has no trial period', async () => {
    // A subscription row written without the S5b trial mirror (as before reconciliation).
    const o = await owner()
    await fixture.client.begin(async (tx) => {
      await tx`set local session_replication_role = replica`
      await tx`delete from subscription_periods where owner_id=${o.id}`
    })
    const { subscriptions } = services('periods')
    const scoped = tenantDatabase(fixture.db, o.organization)
    await expect(scoped.transaction((tx) => subscriptions.assertAccess(tx))).rejects.toMatchObject({
      code: 'SUBSCRIPTION_PERIODS_INCONSISTENT',
    })
    expect(await scoped.transaction((tx) => subscriptions.workerEligible(tx))).toBe(false)
    expect(await adminStatus('periods', o.id)).toBe('expired')
    // Legacy reads are unaffected (explicit rollback path).
    expect((await services('legacy').subscriptions.summary(o.id)).status).toBe('expired')
  })

  it('applies runtime-role RLS to periods lifecycle joins for administrators, owners and tenants', async () => {
    const a = await owner(),
      b = await owner()
    const { billing } = services('periods')
    const paid = await pay(billing, a.id)
    await pay(billing, b.id)
    await billing.setCancellation(a.id, true)
    await asAdmin((tx) => billing.administration.suspend(b.id, tx))
    await fixture.client.unsafe(
      `grant select on owner_subscriptions, subscription_periods, subscription_suspensions, subscription_scheduled_changes to "${fixture.role}"`,
    )
    const read = (actorType: string, ownerId = '', organizationId = '') =>
      fixture.db.transaction(async (tx) => {
        await tx.execute(sql.raw(`set local role "${fixture.role}"`))
        const [role] = await tx.execute<{ rolsuper: boolean; rolbypassrls: boolean }>(
          sql`select rolsuper, rolbypassrls from pg_roles where rolname=current_user`,
        )
        expect(role).toEqual({ rolsuper: false, rolbypassrls: false })
        await tx.execute(
          sql`select set_config('app.actor_type',${actorType},true), set_config('app.owner_id',${ownerId},true), set_config('app.organization_id',${organizationId},true)`,
        )
        return tx.execute<{ owner_id: string; status: string }>(
          sql`select owner_id,status from (${coverageLifecycleSql('periods')(sql`${clock().toISOString()}::timestamptz`)}) l where owner_id in (${a.id},${b.id}) order by owner_id`,
        )
      })
    expect(await read('platform_admin')).toEqual(
      expect.arrayContaining([
        { owner_id: a.id, status: 'active' },
        { owner_id: b.id, status: 'suspended' },
      ]),
    )
    expect(await read('owner', a.id)).toEqual([{ owner_id: a.id, status: 'active' }])
    expect(await read('staff', '', b.organization)).toEqual([
      { owner_id: b.id, status: 'suspended' },
    ])
    expect(await read('')).toEqual([])
    at = new Date(paid.coverageEnd!).getTime() + DAY
    expect(await read('owner', a.id)).toEqual([{ owner_id: a.id, status: 'expired' }])
  })

  it('filters before HTTP pagination and counts periods rather than stale legacy mirrors', async () => {
    const a = await owner(),
      b = await owner(),
      suspended = await owner()
    const { billing } = services('periods')
    await pay(billing, a.id)
    await pay(billing, b.id)
    await pay(billing, suspended.id)
    await asAdmin((tx) => billing.administration.suspend(suspended.id, tx))
    const activeIds = [a.id, b.id]
    for (let i = 0; i < 19; i++) {
      const extra = await owner()
      await pay(billing, extra.id)
      activeIds.push(extra.id)
    }
    // Real dual-written paid periods remain active while the legacy payment mirror is deliberately stale.
    await fixture.client`update subscription_payments set coverage_end=coverage_end-interval '60 days',coverage_start=coverage_start-interval '60 days' where owner_id in (${a.id},${b.id})`
    const app = await buildApp({
      environment: loadEnvironment({
        NODE_ENV: 'test',
        OWNER_AUTH_ENABLED: 'true',
        SUBSCRIPTION_COVERAGE_READS: 'periods',
        ADMIN_TOTP_KEY: randomBytes(32).toString('base64'),
      }),
      logger: false,
    })
    attachTestDatabase(app, fixture)
    try {
      expect((await app.inject({ method: 'GET', url: '/api/v1/admin/overview' })).statusCode).toBe(
        401,
      )
      const pending = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/auth/login',
        headers: { origin: 'http://localhost:5173' },
        payload: { email: actor.email, password: 'admin-password-2026' },
      })
      expect(pending.statusCode, pending.body).toBe(200)
      const verified = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/auth/2fa',
        headers: { origin: 'http://localhost:5173' },
        cookies: {
          slama_admin_session: pending.cookies.find((c) => c.name === 'slama_admin_session')!.value,
        },
        payload: { code: totp(base32Decode(pending.json().enrollment.secret), Date.now()) },
      })
      expect(verified.statusCode, verified.body).toBe(200)
      const cookies = {
        slama_admin_session: verified.cookies.find((c) => c.name === 'slama_admin_session')!.value,
      }
      const overview = await app.inject({ method: 'GET', url: '/api/v1/admin/overview', cookies })
      expect(overview.statusCode, overview.body).toBe(200)
      expect(overview.json()).toMatchObject({
        activeSubscriptions: 21,
        suspended: 1,
        inGracePeriod: 0,
      })
      const pages = []
      for (const page of [1, 2, 3]) {
        const response = await app.inject({
          method: 'GET',
          url: `/api/v1/admin/owners?status=active&page=${page}`,
          cookies,
        })
        expect(response.statusCode, response.body).toBe(200)
        expect(response.json().total).toBe(21)
        pages.push(response.json().items)
      }
      expect(pages[0]).toHaveLength(20)
      expect(pages[1]).toHaveLength(1)
      expect(pages[2]).toEqual([])
      expect([...pages[0], ...pages[1]].map((o: { id: string }) => o.id).sort()).toEqual(
        activeIds.sort(),
      )
      const filtered = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/owners?status=suspended',
        cookies,
      })
      expect(filtered.statusCode, filtered.body).toBe(200)
      expect(filtered.json().total).toBe(1)
      expect(filtered.json().items[0].id).toBe(suspended.id)
    } finally {
      await app.close()
    }
  })

  it('serializes confirm/confirm and confirm/reject without duplicate periods or partial decisions', async () => {
    const o = await owner()
    const { billing } = services('periods')
    const submit = () =>
      billing.submit(o.id, {
        planCode: 'essential',
        cycle: 'monthly',
        method: 'cash',
        reference: randomUUID(),
      })
    const first = await submit()
    const confirmed = await Promise.all([
      billing.confirm(first.id, 'ops'),
      billing.confirm(first.id, 'ops'),
    ])
    expect(confirmed.map((p) => p.status)).toEqual(['confirmed', 'confirmed'])
    expect(
      await fixture.client`select id from subscription_periods where payment_id=${first.id}`,
    ).toHaveLength(1)
    const second = await submit()
    const results = await Promise.allSettled([
      billing.confirm(second.id, 'ops'),
      billing.reject(second.id, 'ops', 'not received'),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1)
    const loser = results.find((r) => r.status === 'rejected')!
    expect(loser.status === 'rejected' && loser.reason.code).toBe(
      results[0]!.status === 'fulfilled' ? 'PAYMENT_CONFIRMED' : 'PAYMENT_REJECTED',
    )
    const [row] =
      await fixture.client`select status from subscription_payments where id=${second.id}`
    expect(['confirmed', 'rejected']).toContain(row!.status)
    expect(
      await fixture.client`select id from subscription_periods where payment_id=${second.id}`,
    ).toHaveLength(row!.status === 'confirmed' ? 1 : 0)
    expect((await decisions('periods', o)).status).toBe('active')
  })

  it('serializes extensions, suspension and resume and rolls back a failed confirmation', async () => {
    const o = await owner()
    const { billing } = services('periods')
    const paid = await pay(billing, o.id)
    await Promise.all([
      asAdmin((tx) => billing.administration.extend(o.id, 2, actor, tx)),
      asAdmin((tx) => billing.administration.extend(o.id, 3, actor, tx)),
    ])
    const periods =
      await fixture.client`select starts_at,ends_at from subscription_periods where owner_id=${o.id} and kind='complimentary' order by starts_at`
    expect(periods).toHaveLength(2)
    expect(new Date(periods[0]!.starts_at)).toEqual(new Date(paid.coverageEnd!))
    expect(periods[0]!.ends_at).toEqual(periods[1]!.starts_at)
    expect(new Date(periods[1]!.ends_at)).toEqual(
      new Date(new Date(paid.coverageEnd!).getTime() + 5 * DAY),
    )
    const suspended = await Promise.allSettled([
      asAdmin((tx) => billing.administration.suspend(o.id, tx)),
      asAdmin((tx) => billing.administration.suspend(o.id, tx)),
    ])
    expect(suspended.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(suspended.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { code: 'SUBSCRIPTION_SUSPENDED' },
    })
    expect(
      await fixture.client`select id from subscription_suspensions where owner_id=${o.id} and ended_at is null`,
    ).toHaveLength(1)
    at += 1000
    const resumed = await Promise.allSettled([
      asAdmin((tx) => billing.administration.resume(o.id, tx)),
      asAdmin((tx) => billing.administration.resume(o.id, tx)),
    ])
    expect(resumed.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(resumed.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { code: 'SUBSCRIPTION_NOT_SUSPENDED' },
    })
    const [suspension] =
      await fixture.client`select started_at,ended_at from subscription_suspensions where owner_id=${o.id}`
    expect(
      new Date(suspension!.ended_at).getTime() - new Date(suspension!.started_at).getTime(),
    ).toBe(1000)
    const rollbackOwner = await owner()
    const payment = await billing.submit(rollbackOwner.id, {
      planCode: 'essential',
      cycle: 'monthly',
      method: 'cash',
      reference: randomUUID(),
    })
    await expect(
      billing.confirm(payment.id, 'ops', undefined, async () => {
        throw new Error('injected audit failure')
      }),
    ).rejects.toThrow('injected audit failure')
    expect(
      await fixture.client`select id from subscription_periods where payment_id=${payment.id}`,
    ).toHaveLength(0)
    const [pending] =
      await fixture.client`select status from subscription_payments where id=${payment.id}`
    expect(pending!.status).toBe('submitted')
    await billing.confirm(payment.id, 'ops')
    expect(
      await fixture.client`select id from subscription_periods where payment_id=${payment.id}`,
    ).toHaveLength(1)
  })

  it('keeps cancel/renew races consistent with the final serialized cancellation', async () => {
    const o = await owner()
    const { billing } = services('periods')
    await pay(billing, o.id)
    const payment = await billing.submit(o.id, {
      planCode: 'essential',
      cycle: 'monthly',
      method: 'cash',
      reference: randomUUID(),
    })
    await Promise.all([billing.setCancellation(o.id, true), billing.confirm(payment.id, 'ops')])
    const [legacy] =
      await fixture.client`select cancel_at_period_end,paid_through_at from owner_subscriptions where owner_id=${o.id}`
    const scheduled =
      await fixture.client`select effective_at from subscription_scheduled_changes where owner_id=${o.id} and kind='cancel' and status='scheduled'`
    expect(scheduled).toHaveLength(legacy!.cancel_at_period_end ? 1 : 0)
    if (scheduled.length) expect(scheduled[0]!.effective_at).toBe(legacy!.paid_through_at)
    expect(
      await fixture.client`select id from subscription_periods where payment_id=${payment.id}`,
    ).toHaveLength(1)
    expect((await services('periods').subscriptions.summary(o.id)).cancelAtPeriodEnd).toBe(
      legacy!.cancel_at_period_end,
    )
  })

  it('reads a coherent period snapshot while a resume is uncommitted and after it commits', async () => {
    const o = await owner()
    const { billing, subscriptions } = services('periods')
    const payment = await pay(billing, o.id)
    await asAdmin((tx) => billing.administration.suspend(o.id, tx))
    at += 1000
    let entered!: () => void, release!: () => void
    const ready = new Promise<void>((resolve) => {
      entered = resolve
    })
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const resume = asAdmin(async (tx) => {
      await billing.administration.resume(o.id, tx)
      entered()
      await gate
    })
    try {
      await Promise.race([
        ready,
        resume.then(() => {
          throw new Error('resume did not reach barrier')
        }),
      ])
      const before = await subscriptions.summary(o.id)
      expect(before.status).toBe('suspended')
      expect(before.paidThroughAt).toBe(payment.coverageEnd)
    } finally {
      release()
      await resume
    }
    const after = await subscriptions.summary(o.id)
    expect(after.status).toBe('active')
    expect(new Date(after.paidThroughAt!).getTime()).toBe(
      new Date(payment.coverageEnd!).getTime() + 1000,
    )
  })

  it('serializes resume/confirm and applies the freeze exactly once to existing coverage', async () => {
    const o = await owner()
    const { billing } = services('periods')
    const first = await pay(billing, o.id)
    const pending = await billing.submit(o.id, {
      planCode: 'essential',
      cycle: 'monthly',
      method: 'cash',
      reference: randomUUID(),
    })
    await asAdmin((tx) => billing.administration.suspend(o.id, tx))
    at += 1000
    await Promise.all([
      asAdmin((tx) => billing.administration.resume(o.id, tx)),
      billing.confirm(pending.id, 'ops'),
    ])
    const rows =
      await fixture.client`select starts_at,ends_at from subscription_periods where owner_id=${o.id} and kind='paid' order by starts_at`
    expect(rows).toHaveLength(2)
    expect(new Date(rows[0]!.ends_at).getTime()).toBe(new Date(first.coverageEnd!).getTime() + 1000)
    expect(rows[1]!.starts_at).toBe(rows[0]!.ends_at)
    expect((await decisions('periods', o)).status).toBe('active')
    expect(
      await fixture.client`select id from subscription_suspensions where owner_id=${o.id} and ended_at is null`,
    ).toHaveLength(0)
  })

  it('serializes a complimentary extension and payment with adjacent, nonduplicate coverage', async () => {
    const o = await owner()
    const { billing } = services('periods')
    const first = await pay(billing, o.id)
    const pending = await billing.submit(o.id, {
      planCode: 'essential',
      cycle: 'monthly',
      method: 'cash',
      reference: randomUUID(),
    })
    await Promise.all([
      asAdmin((tx) => billing.administration.extend(o.id, 3, actor, tx)),
      billing.confirm(pending.id, 'ops'),
    ])
    const rows =
      await fixture.client`select kind,starts_at,ends_at from subscription_periods where owner_id=${o.id} and kind<>'trial' order by starts_at`
    expect(rows).toHaveLength(3)
    expect(new Date(rows[0]!.ends_at)).toEqual(new Date(first.coverageEnd!))
    expect(rows[1]!.starts_at).toBe(rows[0]!.ends_at)
    expect(rows[2]!.starts_at).toBe(rows[1]!.ends_at)
    expect(rows.map((r) => r.kind).sort()).toEqual(['complimentary', 'paid', 'paid'])
    const [legacy] =
      await fixture.client`select paid_through_at from owner_subscriptions where owner_id=${o.id}`
    expect(legacy!.paid_through_at).toBe(rows[2]!.ends_at)
    expect((await decisions('periods', o)).status).toBe('active')
  })

  it.each(['periods', 'legacy'] as const)(
    'freezes the five remaining paid grace days with %s writes and keeps rollback aligned',
    async (reads) => {
      const o = await owner()
      const { billing } = services(reads)
      const resumedAt = at
      const suspendedAt = at - 10 * DAY
      const purchase = new Date(suspendedAt - 2 * DAY)
      purchase.setUTCMonth(purchase.getUTCMonth() - 1)
      at = purchase.getTime()
      await pay(billing, o.id)
      await seedPaidEnd(o.id, suspendedAt - 2 * DAY)
      if (reads === 'legacy') {
        // Imported PostgreSQL rows may retain microseconds beyond JavaScript Date precision.
        await fixture.client.begin(async (tx) => {
          await tx`set local session_replication_role=replica`
          await tx`update subscription_payments set coverage_end=coverage_end+interval '123 microseconds' where owner_id=${o.id}`
          await tx`update subscription_periods set ends_at=ends_at+interval '123 microseconds' where owner_id=${o.id} and kind='paid'`
          await tx`update owner_subscriptions set paid_through_at=paid_through_at+interval '123 microseconds' where owner_id=${o.id}`
        })
      }
      at = suspendedAt
      expect((await decisions('periods', o)).status).toBe('past_due')
      at = resumedAt
      await asAdmin((tx) => billing.administration.suspend(o.id, tx))
      // Represent ten elapsed days without changing the DB clock or bypassing resume guards.
      // Only the disposable fixture's open suspension and legacy mirror are backdated.
      await backdateSuspension(o.id, suspendedAt)
      await asAdmin((tx) => billing.administration.resume(o.id, tx))
      for (const mode of ['periods', 'legacy'] as const) {
        expect(await decisions(mode, o)).toMatchObject({
          status: 'past_due',
          access: 'allowed',
          worker: true,
          admin: 'past_due',
          graceEndsAt: new Date(at + 5 * DAY).toISOString(),
        })
      }
      const [mirror] =
        await fixture.client`select paid_through_at, paid_through_at=(select max(coverage_end) from subscription_payments where owner_id=${o.id}) as aligned from owner_subscriptions where owner_id=${o.id}`
      expect(mirror!.aligned).toBe(true)
      expect(new Date(mirror!.paid_through_at).getTime()).toBe(at - 2 * DAY)
      at += 5 * DAY - 1
      expect((await decisions('periods', o)).status).toBe('past_due')
      at += 1
      expect((await decisions('periods', o)).status).toBe('expired')
      expect((await decisions('legacy', o)).status).toBe('expired')
    },
  )

  it.each(['complimentary', 'cancelled', 'elapsed_grace'] as const)(
    'does not revive expired %s coverage on resume',
    async (kind) => {
      const o = await owner()
      const { billing } = services('periods')
      const resumedAt = at,
        suspendedAt = at - 10 * DAY
      const daysBefore = kind === 'elapsed_grace' ? 7 : kind === 'complimentary' ? 5 : 2
      const purchase = new Date(suspendedAt - daysBefore * DAY)
      purchase.setUTCMonth(purchase.getUTCMonth() - 1)
      at = purchase.getTime()
      await pay(billing, o.id)
      const paidEnd = suspendedAt - daysBefore * DAY
      await seedPaidEnd(o.id, paidEnd)
      if (kind === 'cancelled') await billing.setCancellation(o.id, true)
      if (kind === 'complimentary')
        await asAdmin((tx) => billing.administration.extend(o.id, 3, actor, tx))
      at = suspendedAt
      expect((await decisions('periods', o)).status).toBe('expired')
      const periodsBefore =
        await fixture.client`select id,starts_at,ends_at from subscription_periods where owner_id=${o.id} and kind<>'trial' order by starts_at`
      const paymentsBefore =
        await fixture.client`select id,coverage_start,coverage_end from subscription_payments where owner_id=${o.id} order by coverage_start`
      at = resumedAt
      await asAdmin((tx) => billing.administration.suspend(o.id, tx))
      await backdateSuspension(o.id, suspendedAt)
      await asAdmin((tx) => billing.administration.resume(o.id, tx))
      expect(
        await fixture.client`select id,starts_at,ends_at from subscription_periods where owner_id=${o.id} and kind<>'trial' order by starts_at`,
      ).toEqual(periodsBefore)
      expect(
        await fixture.client`select id,coverage_start,coverage_end from subscription_payments where owner_id=${o.id} order by coverage_start`,
      ).toEqual(paymentsBefore)
      for (const mode of ['periods', 'legacy'] as const) {
        expect(await decisions(mode, o)).toMatchObject({
          status: 'expired',
          access: 'SUBSCRIPTION_EXPIRED',
          worker: false,
          admin: 'expired',
        })
      }
      const summary = await services('periods').subscriptions.summary(o.id)
      if (kind !== 'elapsed_grace') expect(summary.graceEndsAt).toBeNull()
      expect(new Date(summary.paidThroughAt!).getTime()).toBe(
        paidEnd + (kind === 'complimentary' ? 3 * DAY : 0),
      )
    },
  )

  it('freezes remaining trial time without creating trial grace in either reader', async () => {
    const o = await owner(5)
    const { billing } = services('periods')
    const [before] =
      await fixture.client`select trial_ends_at from owner_subscriptions where owner_id=${o.id}`
    await asAdmin((tx) => billing.administration.suspend(o.id, tx))
    await backdateSuspension(o.id, at - 10 * DAY)
    await asAdmin((tx) => billing.administration.resume(o.id, tx))
    const end = new Date(before!.trial_ends_at).getTime() + 10 * DAY
    for (const mode of ['periods', 'legacy'] as const) {
      expect(await services(mode).subscriptions.summary(o.id)).toMatchObject({
        status: 'trial',
        trialEndsAt: new Date(end).toISOString(),
        graceEndsAt: null,
      })
    }
    at = end
    expect(await decisions('periods', o)).toMatchObject({
      status: 'expired',
      graceEndsAt: null,
      access: 'SUBSCRIPTION_EXPIRED',
    })
    expect(await decisions('legacy', o)).toMatchObject({
      status: 'expired',
      graceEndsAt: null,
      access: 'SUBSCRIPTION_EXPIRED',
    })
  })

  it('rejects period reads without period writes', () => {
    expect(() =>
      loadEnvironment({
        NODE_ENV: 'test',
        SUBSCRIPTION_COVERAGE_READS: 'periods',
        SUBSCRIPTION_PERIOD_WRITES: 'off',
      }),
    ).toThrow(/SUBSCRIPTION_COVERAGE_READS/)
    expect(loadEnvironment({ NODE_ENV: 'test' }).SUBSCRIPTION_COVERAGE_READS).toBe('periods')
    expect(() =>
      createBillingService(
        createBillingRepository(() => fixture.db),
        createSubscriptionRepository(() => fixture.db),
        clock,
        () => {},
        false,
        'periods',
      ),
    ).toThrow(/SUBSCRIPTION_PERIOD_WRITES/)
  })
})
