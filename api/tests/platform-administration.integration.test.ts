import { createHash, randomBytes } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/env.js'
import { base32Decode, totp } from '../src/lib/totp.js'
import { createAdminAccounts } from '../src/modules/platform/administration/index.js'
import { createBillingRepository } from '../src/modules/platform/subscriptions/repositories/billing.repository.js'
import {
  attachTestDatabase,
  isolatedDatabase,
  seedPaidCoverage,
  testOwnerId,
} from './helpers/postgres.js'

const origin = 'http://localhost:5173'
const headers = { origin }
const email = 'ops@example.test'
const password = 'admin-password-2026'
const sha = (value: string) => createHash('sha256').update(value).digest('hex')

describe('SaaS administration portal', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let app: Awaited<ReturnType<typeof buildApp>>
  let accounts: ReturnType<typeof createAdminAccounts>
  // The lifecycle counts include the fixture owner as a trial; the others use paid coverage.
  const trialOwner = new Set(['counts subscriptions by lifecycle with the coverage rules'])
  beforeEach(async ({ task }) => {
    fixture = await isolatedDatabase({ owner: trialOwner.has(task.name) ? 'trial' : 'paid' })
    app = await buildApp({
      environment: loadEnvironment({
        NODE_ENV: 'test',
        OWNER_AUTH_ENABLED: 'true',
        OWNER_PORTAL_ORIGIN: origin,
        CORS_ORIGIN: origin,
        ADMIN_TOTP_KEY: randomBytes(32).toString('base64'),
      }),
      logger: false,
    })
    attachTestDatabase(app, fixture)
    accounts = createAdminAccounts(() => fixture.db)
    await accounts.create({ email: 'Ops@Example.Test ', name: 'Ops', password })
  })
  afterEach(async () => {
    await app?.close()
    await fixture?.cleanup()
  })

  const cookieOf = (response: { cookies: { name: string; value: string }[] }) =>
    response.cookies.find((c) => c.name === 'slama_admin_session')?.value
  const login = (pw = password) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      headers,
      payload: { email, password: pw },
    })
  const verify = (cookie: string | undefined, code: string) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/2fa',
      headers,
      cookies: cookie ? { slama_admin_session: cookie } : {},
      payload: { code },
    })
  const as = (cookie: string) => ({
    get: (url: string) =>
      app.inject({ method: 'GET', url, cookies: { slama_admin_session: cookie } }),
    post: (url: string, payload: object = {}) =>
      app.inject({
        method: 'POST',
        url,
        headers,
        cookies: { slama_admin_session: cookie },
        payload,
      }),
    put: (url: string, payload: object) =>
      app.inject({
        method: 'PUT',
        url,
        headers,
        cookies: { slama_admin_session: cookie },
        payload,
      }),
  })
  /** Enrolls on first sign-in and returns the session cookie and decoded TOTP key. */
  async function signIn() {
    const pending = await login()
    expect(pending.statusCode).toBe(200)
    const body = pending.json()
    expect(body.step).toBe('enroll')
    const key = base32Decode(body.enrollment.secret)
    const done = await verify(cookieOf(pending), totp(key, Date.now()))
    expect(done.statusCode).toBe(200)
    return { cookie: cookieOf(done)!, key }
  }
  const auditRows = (action: string) =>
    fixture.client`select * from platform_admin_audit where action=${action} order by created_at`
  async function submittedPayment(reference: string) {
    const [row] =
      await fixture.client`insert into subscription_payments(owner_id,plan_code,plan_version_id,cycle,kind,method,reference,currency,amount_ht,tax_amount,amount_ttc) values (${testOwnerId},'business',(select plan_version_id from plan_selling where plan_code='business'),'monthly','renewal','cash',${reference},'MAD',29900,0,29900) returning id`
    return row!.id as string
  }

  it('counts subscriptions by lifecycle with the coverage rules', async () => {
    const day = 86_400_000
    const at = (days: number) => new Date(Date.now() + days * day).toISOString()
    // Fixture owner: trial that ends within 7 days, with one pending payment.
    const pendingFixture = await submittedPayment('overview-fixture')
    expect(pendingFixture).toBeTruthy()
    async function owner(
      name: string,
      trialStartDays: number,
      coverage: [number, number] | null,
      cancel = false,
    ) {
      const id = randomBytesUuid()
      await fixture.client`insert into platform_users (id,email,password_hash,created_at) values (${id},${`${name.toLowerCase()}@example.test`},'x',${at(trialStartDays)})`
      await fixture.client`insert into owner_subscriptions(owner_id,plan_code,trial_started_at,trial_ends_at) values (${id},'trial',${at(trialStartDays)},${at(trialStartDays + 7)})`
      if (coverage)
        await seedPaidCoverage(fixture.db, {
          ownerId: id,
          planCode: 'pro',
          start: new Date(at(coverage[0])),
          end: new Date(at(coverage[1])),
          reference: name,
        })
      if (cancel) {
        // Owner-scheduled cancellation at the end of the paid coverage (period model and legacy flag).
        const billing = createBillingRepository(() => fixture.db)
        await billing.admin(async (tx) => {
          await billing.scheduleCancel(
            id,
            new Date(at(coverage![1])),
            { type: 'owner', ownerId: id },
            tx,
          )
          await tx.execute(
            sql`update owner_subscriptions set cancel_at_period_end=true where owner_id=${id}`,
          )
        })
      }
      return id
    }
    const trial = await owner('trial', -4, null)
    await owner('active', -30, [-10, 20])
    await owner('grace', -60, [-40, -3])
    await owner('graceEdge', -60, [-40, -8])
    await owner('cancelled', -60, [-40, -1], true)
    await owner('lapsed', -60, [-50, -20])
    await owner('noPayment', -30, null)
    await fixture.client`insert into subscription_payments(owner_id,plan_code,plan_version_id,cycle,kind,method,reference,currency,amount_ht,tax_amount,amount_ttc) values (${trial},'pro',(select plan_version_id from plan_selling where plan_code='pro'),'monthly','activation','cash','overview-trial','MAD',100,0,100)`

    const anonymous = await app.inject({ method: 'GET', url: '/api/v1/admin/overview' })
    expect(anonymous.statusCode).toBe(401)
    const { cookie } = await signIn()
    const response = await as(cookie).get('/api/v1/admin/overview')
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      pendingPayments: 2,
      activeSubscriptions: 1,
      trialsEndingSoon: 2,
      inGracePeriod: 1,
      expired: 4,
      suspended: 0,
    })
  })

  it('rejects owner and staff sessions on every admin route', async () => {
    const token = randomBytes(32).toString('base64url')
    await fixture.client`insert into owner_sessions(owner_id,token_hash,expires_at) values (${testOwnerId},${sha(token)},now()+interval '1 day')`
    for (const url of [
      '/api/v1/admin/auth/me',
      '/api/v1/admin/payments',
      '/api/v1/admin/owners',
      '/api/v1/admin/billing-settings',
      '/api/v1/admin/audit',
    ]) {
      const response = await app.inject({
        method: 'GET',
        url,
        cookies: { slama_owner_session: token, slama_staff_session: token },
      })
      expect(response.statusCode).toBe(401)
      expect(response.json().code).toBe('UNAUTHENTICATED')
    }
    const confirm = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/payments/${await submittedPayment('x')}/confirm`,
      headers,
      cookies: { slama_owner_session: token },
      payload: {},
    })
    expect(confirm.statusCode).toBe(401)
  })

  it('requires TOTP enrollment, then a code on every sign-in, and rejects replay', async () => {
    const wrong = await login('wrong-password')
    const unknown = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      headers,
      payload: { email: 'nobody@example.test', password },
    })
    expect(wrong.statusCode).toBe(401)
    const { requestId: _a, ...unknownBody } = unknown.json()
    const { requestId: _b, ...wrongBody } = wrong.json()
    expect(unknownBody).toEqual(wrongBody)
    expect((await auditRows('auth.login_failed')).length).toBe(2)

    const pending = await login()
    const pendingCookie = cookieOf(pending)!
    const cookie = pending.cookies.find((c) => c.name === 'slama_admin_session')!
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/' })
    // A pending (password-only) session never authorizes admin routes.
    expect((await as(pendingCookie).get('/api/v1/admin/auth/me')).statusCode).toBe(401)
    const { secret, otpauthUri } = pending.json().enrollment
    expect(otpauthUri).toContain(`secret=${secret}`)
    const [stored] = await fixture.client`select totp_secret from platform_admins`
    expect(stored!.totp_secret).not.toContain(secret)
    const key = base32Decode(secret)
    expect((await verify(pendingCookie, '000000')).json().code).toBe('INVALID_CODE')
    const code = totp(key, Date.now())
    const done = await verify(pendingCookie, code)
    expect(done.statusCode).toBe(200)
    expect(done.json().admin).toMatchObject({ email, name: 'Ops' })
    expect(done.body).not.toContain(secret)
    const session = cookieOf(done)!
    expect(session).not.toBe(pendingCookie)
    expect((await as(session).get('/api/v1/admin/auth/me')).statusCode).toBe(200)
    // The pending token was rotated away.
    expect((await verify(pendingCookie, totp(key, Date.now() + 30_000))).statusCode).toBe(401)

    const again = await login()
    expect(again.json()).toEqual({ step: 'verify', enrollment: null })
    expect((await verify(cookieOf(again), code)).statusCode).toBe(401)
    const next = await verify(cookieOf(again), totp(key, Date.now() + 30_000))
    expect(next.statusCode).toBe(200)
    expect((await auditRows('auth.login')).length).toBe(2)

    const [hash] =
      await fixture.client`select token_hash from platform_admin_sessions where verified_at is not null limit 1`
    expect(hash!.token_hash).toMatch(/^[a-f0-9]{64}$/)

    const out = await as(session).post('/api/v1/admin/auth/logout')
    expect(out.statusCode).toBe(204)
    expect((await as(session).get('/api/v1/admin/auth/me')).statusCode).toBe(401)
  })

  it('revokes a pending sign-in after five wrong codes', async () => {
    const pending = await login()
    const key = base32Decode(pending.json().enrollment.secret)
    for (let i = 0; i < 5; i++)
      expect((await verify(cookieOf(pending), '000000')).statusCode).toBe(401)
    expect((await verify(cookieOf(pending), totp(key, Date.now()))).statusCode).toBe(401)
  })

  it('expires sessions after 30 idle minutes and 8 hours absolute', async () => {
    const { cookie } = await signIn()
    await fixture.client`update platform_admin_sessions set last_seen_at=now()-interval '31 minutes' where token_hash=${sha(cookie)}`
    expect((await as(cookie).get('/api/v1/admin/auth/me')).statusCode).toBe(401)

    // Expired sessions are not resurrected, but a fresh sign-in still works.
    expect((await login()).json().step).toBe('verify')
  })

  it('enforces the absolute lifetime even for active sessions', async () => {
    const { cookie } = await signIn()
    const me = await as(cookie).get('/api/v1/admin/auth/me')
    const expiresAt = new Date(me.json().expiresAt).getTime()
    expect(expiresAt - Date.now()).toBeGreaterThan(7.9 * 3_600_000)
    expect(expiresAt - Date.now()).toBeLessThanOrEqual(8 * 3_600_000)
    expect(me.json().idleTimeoutSeconds).toBe(1800)
    await fixture.client`update platform_admin_sessions set created_at=now()-interval '9 hours', expires_at=now()-interval '1 second', last_seen_at=now() where token_hash=${sha(cookie)}`
    expect((await as(cookie).get('/api/v1/admin/auth/me')).statusCode).toBe(401)
  })

  it('rejects a disabled administrator, including existing sessions', async () => {
    const { cookie } = await signIn()
    await accounts.disable(email)
    expect((await as(cookie).get('/api/v1/admin/auth/me')).statusCode).toBe(401)
    const denied = await login()
    expect(denied.statusCode).toBe(401)
    expect(denied.json().code).toBe('INVALID_CREDENTIALS')
    expect((await auditRows('admin.disable')).length).toBe(1)
  })

  it('forces re-enrollment after a 2FA reset', async () => {
    const { cookie } = await signIn()
    await accounts.reset2fa(email)
    expect((await as(cookie).get('/api/v1/admin/auth/me')).statusCode).toBe(401)
    expect((await login()).json().step).toBe('enroll')
    expect((await auditRows('admin.reset_2fa')).length).toBe(1)
    expect((await auditRows('admin.create')).length).toBe(1)
  })

  it('confirms payments idempotently with exactly one audit row', async () => {
    const { cookie } = await signIn()
    const id = await submittedPayment('bank-1')
    const list = await as(cookie).get('/api/v1/admin/payments?status=submitted')
    expect(list.statusCode).toBe(200)
    expect(list.json().items[0]).toMatchObject({ id, ownerEmail: 'fixture-owner@example.test' })
    const first = await as(cookie).post(`/api/v1/admin/payments/${id}/confirm`, {
      receivedReference: 'VIR-42',
      auditReason: 'receipt checked internally',
    })
    expect(first.statusCode).toBe(200)
    expect(first.json()).toMatchObject({
      status: 'confirmed',
      decidedBy: email,
      receivedReference: 'VIR-42',
    })
    const second = await as(cookie).post(`/api/v1/admin/payments/${id}/confirm`, {
      auditReason: 'retry receipt',
    })
    expect(second.statusCode).toBe(200)
    expect(second.json().coverageEnd).toBe(first.json().coverageEnd)
    const audit = await auditRows('payment.confirm')
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({ target_id: id, actor: email })
    expect(audit[0]!.before.status).toBe('submitted')
    expect(audit[0]!.after.status).toBe('confirmed')
    expect(
      (
        await as(cookie).post(`/api/v1/admin/payments/${id}/reject`, {
          reason: 'x',
          auditReason: 'internal decision',
        })
      ).json().code,
    ).toBe('PAYMENT_CONFIRMED')
  })

  it.each(['confirm', 'reject'] as const)(
    'decides payment %s under the admin session and rolls back all decision state on failure',
    async (operation) => {
      const { cookie } = await signIn()
      const id = await submittedPayment('secure-decision')
      const url = `/api/v1/admin/payments/${id}/${operation}`
      const action = `payment.${operation}`
      const payload = {
        auditReason: 'private internal investigation',
        ...(operation === 'reject'
          ? { reason: 'Transfer not received' }
          : { receivedReference: 'VIR-43' }),
      }
      const snapshot = async () =>
        Promise.all(
          [
            'subscription_payments',
            'owner_subscriptions',
            'subscription_periods',
            'subscription_period_notes',
            'subscription_scheduled_changes',
            'platform_admin_audit',
          ].map(async (table) =>
            JSON.stringify(
              await fixture.client.unsafe(`select * from ${table} t order by row_to_json(t)::text`),
            ),
          ),
        )
      const before = await snapshot()
      expect((await as(cookie).post(url, { ...payload, code: '123456' })).statusCode).toBe(400)
      expect((await as(cookie).post(url, { ...payload, auditReason: undefined })).statusCode).toBe(
        400,
      )
      expect((await as(cookie).post(url, { ...payload, auditReason: '   ' })).statusCode).toBe(400)
      const anonymous = await app.inject({ method: 'POST', url, headers, payload })
      expect(anonymous.statusCode).toBe(401)
      expect(await snapshot()).toEqual(before)
      await fixture.client
        .unsafe(`create function reject_decision_audit() returns trigger language plpgsql as $$
        begin if NEW.action='${action}' then raise exception 'test audit failure'; end if; return NEW; end $$`)
      await fixture.client.unsafe(
        'create trigger reject_decision_audit before insert on platform_admin_audit for each row execute function reject_decision_audit()',
      )
      expect((await as(cookie).post(url, payload)).statusCode).toBe(500)
      expect(await snapshot()).toEqual(before)
      await fixture.client.unsafe('drop trigger reject_decision_audit on platform_admin_audit')
      const success = await as(cookie).post(url, payload)
      expect(success.statusCode, success.body).toBe(200)
      expect(success.body).not.toContain('private internal investigation')
      expect(success.json()).not.toHaveProperty('code')
      const [actor] = await fixture.client`select id from platform_admins where email=${email}`
      const [audit] = await auditRows(action)
      expect(audit).toMatchObject({
        admin_id: actor!.id,
        actor: email,
        target_id: id,
        after: { auditReason: 'private internal investigation' },
      })
      expect(audit!.after).not.toHaveProperty('code')
      const committed = await snapshot()
      // Idempotent replay: same decision, no new state or audit row.
      const retry = await as(cookie).post(url, payload)
      expect(retry.statusCode).toBe(200)
      expect(retry.json()).toEqual(success.json())
      expect(await snapshot()).toEqual(committed)
      expect(await auditRows(action)).toHaveLength(1)
      const opposite = operation === 'confirm' ? 'reject' : 'confirm'
      const conflict = await as(cookie).post(`/api/v1/admin/payments/${id}/${opposite}`, {
        auditReason: 'conflicting decision',
        ...(opposite === 'reject' ? { reason: 'Not received' } : {}),
      })
      expect(conflict.statusCode).toBe(409)
      expect(conflict.json().code).toBe(
        operation === 'confirm' ? 'PAYMENT_CONFIRMED' : 'PAYMENT_REJECTED',
      )
      expect(await snapshot()).toEqual(committed)
      // Concurrent retries serialize on the owner lock and stay idempotent.
      const concurrent = await Promise.all([1, 2].map(() => as(cookie).post(url, payload)))
      expect(concurrent.map((response) => response.statusCode)).toEqual([200, 200])
      expect(await snapshot()).toEqual(committed)
    },
  )

  it('requires a rejection reason and shows it to the owner', async () => {
    const { cookie } = await signIn()
    const id = await submittedPayment('bank-2')
    expect((await as(cookie).post(`/api/v1/admin/payments/${id}/reject`, {})).statusCode).toBe(400)
    expect(
      (
        await as(cookie).post(`/api/v1/admin/payments/${id}/reject`, {
          reason: '   ',
          auditReason: 'internal decision',
        })
      ).statusCode,
    ).toBe(400)
    const rejected = await as(cookie).post(`/api/v1/admin/payments/${id}/reject`, {
      reason: 'Transfer not received',
      auditReason: 'private investigation detail',
    })
    expect(rejected.statusCode).toBe(200)
    expect(rejected.json()).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Transfer not received',
    })
    expect(
      (
        await as(cookie).post(`/api/v1/admin/payments/${id}/reject`, {
          reason: 'again',
          auditReason: 'internal decision',
        })
      ).json().rejectionReason,
    ).toBe('Transfer not received')
    expect(await auditRows('payment.reject')).toHaveLength(1)

    await fixture.client`update platform_users set email_verified_at=now() where id=${testOwnerId}`
    const token = randomBytes(32).toString('base64url')
    await fixture.client`insert into owner_sessions(owner_id,token_hash,expires_at) values (${testOwnerId},${sha(token)},now()+interval '1 day')`
    const owner = await app.inject({
      method: 'GET',
      url: '/api/v1/owner/subscription/payments',
      cookies: { slama_owner_session: token },
    })
    expect(owner.statusCode).toBe(200)
    expect(owner.body).not.toContain('private investigation detail')
    expect(rejected.body).not.toContain('private investigation detail')
    expect(owner.json().data[0]).toMatchObject({
      id,
      status: 'rejected',
      rejectionReason: 'Transfer not received',
    })
    await expect(
      fixture.client`update subscription_payments set rejection_reason=null where id=${id}`,
    ).rejects.toThrow()
  })

  it('updates billing settings with an audited before/after', async () => {
    const { cookie } = await signIn()
    const before = (await as(cookie).get('/api/v1/admin/billing-settings')).json()
    expect(before.currency).toBe('MAD')
    expect(
      (await as(cookie).put('/api/v1/admin/billing-settings', { ...before, paymentMethods: [] }))
        .statusCode,
    ).toBe(400)
    expect(
      (
        await as(cookie).put('/api/v1/admin/billing-settings', {
          taxRateBasisPoints: 10001,
          paymentMethods: ['cash'],
          paymentInstructions: '',
        })
      ).statusCode,
    ).toBe(400)
    const update = {
      taxRateBasisPoints: 2000,
      paymentMethods: ['bank_transfer'],
      paymentInstructions: 'RIB 0000',
    }
    const updated = await as(cookie).put('/api/v1/admin/billing-settings', update)
    expect(updated.statusCode).toBe(200)
    expect(updated.json()).toEqual({ currency: 'MAD', ...update })
    const [audit] = await auditRows('billing_settings.update')
    expect(audit!.before).toMatchObject({ paymentMethods: before.paymentMethods })
    expect(audit!.after).toMatchObject(update)
    const log = (await as(cookie).get('/api/v1/admin/audit')).json()
    expect(log.items[0]).toMatchObject({ action: 'billing_settings.update', actor: email })
    await expect(fixture.client`update platform_admin_audit set actor='x'`).rejects.toThrow(
      /append-only/,
    )
    await expect(fixture.client`delete from platform_admin_audit`).rejects.toThrow(/append-only/)
  })

  it('reports one unresolvable owner per row without failing the list, filters or other owners', async () => {
    const healthy = randomBytesUuid()
    await fixture.client`insert into platform_users (id,email,password_hash) values (${healthy},'healthy-owner@example.test','x')`
    await fixture.client`insert into organizations(id,owner_id,name,slug,activated_at) values (${randomBytesUuid()},${healthy},'Healthy','healthy',now())`
    await seedPaidCoverage(fixture.db, {
      ownerId: healthy,
      planCode: 'essential',
      start: new Date(Date.now() - 86_400_000),
      end: new Date(Date.now() + 30 * 86_400_000),
      reference: 'healthy',
    })
    // The fixture owner pins pro v1; corrupt it behind every guard (simulated storage corruption).
    await fixture.client.begin(async (tx) => {
      await tx`set local session_replication_role = replica`
      await tx`delete from plan_entitlements where entitlement_key='storageBytes' and plan_version_id=(select id from plan_versions where plan_code='pro' and version_number=1)`
    })
    const { cookie } = await signIn()
    const byEmail = (items: { email: string }[]) =>
      Object.fromEntries(items.map((item) => [item.email, item]))
    const all = await as(cookie).get('/api/v1/admin/owners')
    expect(all.statusCode, all.body).toBe(200)
    expect(all.json().total).toBe(2)
    const rows = byEmail(all.json().items)
    expect(rows['fixture-owner@example.test']).toMatchObject({
      id: testOwnerId,
      subscriptionStatus: null,
      planCode: null,
      paidThroughAt: null,
      subscriptionError: 'SUBSCRIPTION_CATALOG_UNAVAILABLE',
      organizationCount: 1,
    })
    expect(rows['healthy-owner@example.test']).toMatchObject({
      subscriptionStatus: 'active',
      planCode: 'essential',
      subscriptionError: null,
    })
    // Status filtering and pagination use the catalog-independent lifecycle SQL: the corrupt owner is
    // still counted as active and paged, without fabricated values.
    const active = (await as(cookie).get('/api/v1/admin/owners?status=active')).json()
    expect(active.total).toBe(2)
    expect(Object.keys(byEmail(active.items)).sort()).toEqual([
      'fixture-owner@example.test',
      'healthy-owner@example.test',
    ])
    expect((await as(cookie).get('/api/v1/admin/owners?status=trial')).json().total).toBe(0)
    const search = (await as(cookie).get('/api/v1/admin/owners?search=healthy')).json()
    expect(search.items.map((i: { email: string }) => i.email)).toEqual([
      'healthy-owner@example.test',
    ])
    const broken = await as(cookie).get(`/api/v1/admin/owners/${testOwnerId}`)
    expect(broken.statusCode, broken.body).toBe(200)
    expect(broken.json()).toMatchObject({
      subscription: null,
      subscriptionError: 'SUBSCRIPTION_CATALOG_UNAVAILABLE',
      payments: [expect.objectContaining({ planCode: 'pro', planVersionNumber: 1 })],
    })
    const fine = (await as(cookie).get(`/api/v1/admin/owners/${healthy}`)).json()
    expect(fine.subscriptionError).toBeNull()
    expect(fine.subscription).toMatchObject({ planCode: 'essential', planVersionNumber: 1 })
    // Payment diagnostics stay readable for both owners.
    const payments = await as(cookie).get('/api/v1/admin/payments')
    expect(payments.statusCode).toBe(200)
    expect(
      payments
        .json()
        .items.map((p: { ownerEmail: string; planVersionNumber: number }) => [
          p.ownerEmail,
          p.planVersionNumber,
        ])
        .sort(),
    ).toEqual([
      ['fixture-owner@example.test', 1],
      ['healthy-owner@example.test', 1],
    ])
  })

  it('lists owners and details without tenant finance data', async () => {
    const { cookie } = await signIn()
    const page = await as(cookie).get('/api/v1/admin/owners?search=FIXTURE')
    expect(page.statusCode).toBe(200)
    expect(page.json()).toMatchObject({ total: 1, page: 1 })
    expect(page.json().items[0]).toMatchObject({
      id: testOwnerId,
      planCode: 'pro',
      subscriptionStatus: 'active',
      organizationCount: 1,
    })
    expect((await as(cookie).get('/api/v1/admin/owners?search=%25')).json().total).toBe(0)
    await fixture.client`insert into platform_users (id,email,password_hash) values (${randomBytesUuid()},'no-organization@example.test','not-a-login-hash')`
    const notStarted = (await as(cookie).get('/api/v1/admin/owners?status=not_started')).json()
    expect(notStarted.items.map((item: { email: string }) => item.email)).toEqual([
      'no-organization@example.test',
    ])
    expect(notStarted.items[0].subscriptionStatus).toBe('not_started')
    const detail = await as(cookie).get(`/api/v1/admin/owners/${testOwnerId}`)
    expect(detail.statusCode).toBe(200)
    expect(detail.json().organizations).toEqual([
      expect.objectContaining({ name: 'Fixture', slug: 'fixture' }),
    ])
    expect(detail.json().subscription.usage).toBeDefined()
    expect(Object.keys(detail.json()).sort()).toEqual([
      'invitationPending',
      'organizations',
      'owner',
      'payments',
      'restriction',
      'subscription',
      'subscriptionError',
    ])
    expect(detail.json().subscriptionError).toBeNull()
    expect(detail.json().subscription.planVersionNumber).toBe(1)
    expect(
      detail.json().payments.every((p: { planVersionNumber: number }) => p.planVersionNumber === 1),
    ).toBe(true)
    expect(detail.body).not.toMatch(/password|invoice|client/i)
    expect((await as(cookie).get(`/api/v1/admin/owners/${randomBytesUuid()}`)).statusCode).toBe(404)
  })

  it('hides administrator tables from owner, staff and worker contexts', async () => {
    await signIn()
    await fixture.client.unsafe(
      `GRANT SELECT, INSERT ON platform_admins, platform_admin_sessions, platform_admin_audit TO "${fixture.role}"`,
    )
    const counts = (actor: string) =>
      fixture.client.begin(async (sql) => {
        await sql.unsafe(`SET LOCAL ROLE "${fixture.role}"`)
        await sql`select set_config('app.actor_type',${actor},true),set_config('app.owner_id',${testOwnerId},true)`
        const [r] =
          await sql`select (select count(*) from platform_admins)::int a,(select count(*) from platform_admin_sessions)::int s,(select count(*) from platform_admin_audit)::int l`
        return r
      })
    for (const actor of ['owner', 'staff', 'worker', ''])
      expect(await counts(actor)).toEqual({ a: 0, s: 0, l: 0 })
    expect((await counts('platform_admin'))!.a).toBe(1)
    await expect(
      fixture.client.begin(async (sql) => {
        await sql.unsafe(`SET LOCAL ROLE "${fixture.role}"`)
        await sql`select set_config('app.actor_type','owner',true)`
        await sql`insert into platform_admin_audit(actor,action,target_type) values ('x','forged','x')`
      }),
    ).rejects.toThrow(/row-level security/)
  })

  it('keeps payment decisions, coverage and billing settings out of owner contexts', async () => {
    const id = await submittedPayment('guard')
    await fixture.client.unsafe(
      `GRANT SELECT ON subscription_payments, owner_subscriptions, billing_settings TO "${fixture.role}";
       GRANT UPDATE (status, rejection_reason, decided_at) ON subscription_payments TO "${fixture.role}";
       GRANT UPDATE (paid_through_at, cancel_at_period_end) ON owner_subscriptions TO "${fixture.role}";
       GRANT UPDATE (tax_rate_basis_points) ON billing_settings TO "${fixture.role}"`,
    )
    const asOwner = <T>(work: (sql: typeof fixture.client) => Promise<T>) =>
      fixture.client.begin(async (sql) => {
        await sql.unsafe(`SET LOCAL ROLE "${fixture.role}"`)
        await sql`select set_config('app.actor_type','owner',true),set_config('app.owner_id',${testOwnerId},true)`
        return work(sql as unknown as typeof fixture.client)
      })
    const updated = await asOwner(
      (sql) =>
        sql`update subscription_payments set status='rejected',rejection_reason='self',decided_at=now() where id=${id} returning id`,
    )
    expect(updated).toHaveLength(0)
    await expect(
      asOwner(
        (sql) => sql`update owner_subscriptions set paid_through_at=now()+interval '10 years'`,
      ),
    ).rejects.toThrow(/administrator context/)
    expect(
      await asOwner(
        (sql) => sql`update owner_subscriptions set cancel_at_period_end=true returning 1`,
      ),
    ).toHaveLength(1)
    await expect(
      asOwner((sql) => sql`update billing_settings set tax_rate_basis_points=0`),
    ).rejects.toThrow(/administrator context/)
  })
})

function randomBytesUuid() {
  const hex = randomBytes(16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}
