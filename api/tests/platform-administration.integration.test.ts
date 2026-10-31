import { createHash, randomBytes } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/env.js'
import { base32Decode, totp } from '../src/lib/totp.js'
import { createAdminAccounts } from '../src/modules/platform/administration/index.js'
import { attachTestDatabase, isolatedDatabase, testOwnerId } from './helpers/postgres.js'

const origin = 'http://localhost:5173'
const headers = { origin }
const email = 'ops@example.test'
const password = 'admin-password-2026'
const sha = (value: string) => createHash('sha256').update(value).digest('hex')

describe('SaaS administration portal', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let app: Awaited<ReturnType<typeof buildApp>>
  let accounts: ReturnType<typeof createAdminAccounts>
  beforeEach(async () => {
    fixture = await isolatedDatabase()
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
      url: '/v1/admin/auth/login',
      headers,
      payload: { email, password: pw },
    })
  const verify = (cookie: string | undefined, code: string) =>
    app.inject({
      method: 'POST',
      url: '/v1/admin/auth/2fa',
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
      await fixture.client`insert into subscription_payments(owner_id,plan_code,cycle,kind,method,reference,currency,amount_ht,tax_amount,amount_ttc) values (${testOwnerId},'business','monthly','renewal','cash',${reference},'MAD',29900,0,29900) returning id`
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
      await fixture.client`insert into owner_subscriptions(owner_id,plan_code,trial_started_at,trial_ends_at,cancel_at_period_end) values (${id},'trial',${at(trialStartDays)},${at(trialStartDays + 7)},${cancel})`
      if (coverage)
        await fixture.client`insert into subscription_payments(owner_id,plan_code,cycle,kind,method,reference,currency,amount_ht,tax_amount,amount_ttc,status,coverage_start,coverage_end,decided_at) values (${id},'pro','monthly','activation','cash',${name},'MAD',100,0,100,'confirmed',${at(coverage[0])},${at(coverage[1])},now())`
      return id
    }
    const trial = await owner('trial', -4, null)
    await owner('active', -30, [-10, 20])
    await owner('grace', -60, [-40, -3])
    await owner('graceEdge', -60, [-40, -8])
    await owner('cancelled', -60, [-40, -1], true)
    await owner('lapsed', -60, [-50, -20])
    await owner('noPayment', -30, null)
    await fixture.client`insert into subscription_payments(owner_id,plan_code,cycle,kind,method,reference,currency,amount_ht,tax_amount,amount_ttc) values (${trial},'pro','monthly','activation','cash','overview-trial','MAD',100,0,100)`

    const anonymous = await app.inject({ method: 'GET', url: '/v1/admin/overview' })
    expect(anonymous.statusCode).toBe(401)
    const { cookie } = await signIn()
    const response = await as(cookie).get('/v1/admin/overview')
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      pendingPayments: 2,
      activeSubscriptions: 1,
      trialsEndingSoon: 2,
      inGracePeriod: 1,
      expired: 4,
    })
  })

  it('rejects owner and staff sessions on every admin route', async () => {
    const token = randomBytes(32).toString('base64url')
    await fixture.client`insert into owner_sessions(owner_id,token_hash,expires_at) values (${testOwnerId},${sha(token)},now()+interval '1 day')`
    for (const url of [
      '/v1/admin/auth/me',
      '/v1/admin/payments',
      '/v1/admin/owners',
      '/v1/admin/billing-settings',
      '/v1/admin/audit',
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
      url: `/v1/admin/payments/${await submittedPayment('x')}/confirm`,
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
      url: '/v1/admin/auth/login',
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
    expect((await as(pendingCookie).get('/v1/admin/auth/me')).statusCode).toBe(401)
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
    expect((await as(session).get('/v1/admin/auth/me')).statusCode).toBe(200)
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

    const out = await as(session).post('/v1/admin/auth/logout')
    expect(out.statusCode).toBe(204)
    expect((await as(session).get('/v1/admin/auth/me')).statusCode).toBe(401)
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
    expect((await as(cookie).get('/v1/admin/auth/me')).statusCode).toBe(401)

    // Expired sessions are not resurrected, but a fresh sign-in still works.
    expect((await login()).json().step).toBe('verify')
  })

  it('enforces the absolute lifetime even for active sessions', async () => {
    const { cookie } = await signIn()
    const me = await as(cookie).get('/v1/admin/auth/me')
    const expiresAt = new Date(me.json().expiresAt).getTime()
    expect(expiresAt - Date.now()).toBeGreaterThan(7.9 * 3_600_000)
    expect(expiresAt - Date.now()).toBeLessThanOrEqual(8 * 3_600_000)
    expect(me.json().idleTimeoutSeconds).toBe(1800)
    await fixture.client`update platform_admin_sessions set created_at=now()-interval '9 hours', expires_at=now()-interval '1 second', last_seen_at=now() where token_hash=${sha(cookie)}`
    expect((await as(cookie).get('/v1/admin/auth/me')).statusCode).toBe(401)
  })

  it('rejects a disabled administrator, including existing sessions', async () => {
    const { cookie } = await signIn()
    await accounts.disable(email)
    expect((await as(cookie).get('/v1/admin/auth/me')).statusCode).toBe(401)
    const denied = await login()
    expect(denied.statusCode).toBe(401)
    expect(denied.json().code).toBe('INVALID_CREDENTIALS')
    expect((await auditRows('admin.disable')).length).toBe(1)
  })

  it('forces re-enrollment after a 2FA reset', async () => {
    const { cookie } = await signIn()
    await accounts.reset2fa(email)
    expect((await as(cookie).get('/v1/admin/auth/me')).statusCode).toBe(401)
    expect((await login()).json().step).toBe('enroll')
    expect((await auditRows('admin.reset_2fa')).length).toBe(1)
    expect((await auditRows('admin.create')).length).toBe(1)
  })

  it('confirms payments idempotently with exactly one audit row', async () => {
    const { cookie } = await signIn()
    const id = await submittedPayment('bank-1')
    const list = await as(cookie).get('/v1/admin/payments?status=submitted')
    expect(list.statusCode).toBe(200)
    expect(list.json().items[0]).toMatchObject({ id, ownerEmail: 'fixture-owner@example.test' })
    const first = await as(cookie).post(`/v1/admin/payments/${id}/confirm`, {
      receivedReference: 'VIR-42',
    })
    expect(first.statusCode).toBe(200)
    expect(first.json()).toMatchObject({
      status: 'confirmed',
      decidedBy: email,
      receivedReference: 'VIR-42',
    })
    const second = await as(cookie).post(`/v1/admin/payments/${id}/confirm`)
    expect(second.statusCode).toBe(200)
    expect(second.json().coverageEnd).toBe(first.json().coverageEnd)
    const audit = await auditRows('payment.confirm')
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({ target_id: id, actor: email })
    expect(audit[0]!.before.status).toBe('submitted')
    expect(audit[0]!.after.status).toBe('confirmed')
    expect(
      (await as(cookie).post(`/v1/admin/payments/${id}/reject`, { reason: 'x' })).json().code,
    ).toBe('PAYMENT_CONFIRMED')
  })

  it('requires a rejection reason and shows it to the owner', async () => {
    const { cookie } = await signIn()
    const id = await submittedPayment('bank-2')
    expect((await as(cookie).post(`/v1/admin/payments/${id}/reject`, {})).statusCode).toBe(400)
    expect(
      (await as(cookie).post(`/v1/admin/payments/${id}/reject`, { reason: '   ' })).statusCode,
    ).toBe(400)
    const rejected = await as(cookie).post(`/v1/admin/payments/${id}/reject`, {
      reason: 'Transfer not received',
    })
    expect(rejected.statusCode).toBe(200)
    expect(rejected.json()).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Transfer not received',
    })
    expect(
      (await as(cookie).post(`/v1/admin/payments/${id}/reject`, { reason: 'again' })).json()
        .rejectionReason,
    ).toBe('Transfer not received')
    expect(await auditRows('payment.reject')).toHaveLength(1)

    await fixture.client`update platform_users set email_verified_at=now() where id=${testOwnerId}`
    const token = randomBytes(32).toString('base64url')
    await fixture.client`insert into owner_sessions(owner_id,token_hash,expires_at) values (${testOwnerId},${sha(token)},now()+interval '1 day')`
    const owner = await app.inject({
      method: 'GET',
      url: '/v1/owner/subscription/payments',
      cookies: { slama_owner_session: token },
    })
    expect(owner.statusCode).toBe(200)
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
    const before = (await as(cookie).get('/v1/admin/billing-settings')).json()
    expect(before.currency).toBe('MAD')
    expect(
      (await as(cookie).put('/v1/admin/billing-settings', { ...before, paymentMethods: [] }))
        .statusCode,
    ).toBe(400)
    expect(
      (
        await as(cookie).put('/v1/admin/billing-settings', {
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
    const updated = await as(cookie).put('/v1/admin/billing-settings', update)
    expect(updated.statusCode).toBe(200)
    expect(updated.json()).toEqual({ currency: 'MAD', ...update })
    const [audit] = await auditRows('billing_settings.update')
    expect(audit!.before).toMatchObject({ paymentMethods: before.paymentMethods })
    expect(audit!.after).toMatchObject(update)
    const log = (await as(cookie).get('/v1/admin/audit')).json()
    expect(log.items[0]).toMatchObject({ action: 'billing_settings.update', actor: email })
    await expect(fixture.client`update platform_admin_audit set actor='x'`).rejects.toThrow(
      /append-only/,
    )
    await expect(fixture.client`delete from platform_admin_audit`).rejects.toThrow(/append-only/)
  })

  it('lists owners and details without tenant finance data', async () => {
    const { cookie } = await signIn()
    const page = await as(cookie).get('/v1/admin/owners?search=FIXTURE')
    expect(page.statusCode).toBe(200)
    expect(page.json()).toMatchObject({ total: 1, page: 1 })
    expect(page.json().items[0]).toMatchObject({
      id: testOwnerId,
      planCode: 'pro',
      subscriptionStatus: 'active',
      organizationCount: 1,
    })
    expect((await as(cookie).get('/v1/admin/owners?search=%25')).json().total).toBe(0)
    const detail = await as(cookie).get(`/v1/admin/owners/${testOwnerId}`)
    expect(detail.statusCode).toBe(200)
    expect(detail.json().organizations).toEqual([
      expect.objectContaining({ name: 'Fixture', slug: 'fixture' }),
    ])
    expect(detail.json().subscription.usage).toBeDefined()
    expect(Object.keys(detail.json()).sort()).toEqual([
      'organizations',
      'owner',
      'payments',
      'subscription',
    ])
    expect(detail.body).not.toMatch(/password|invoice|client/i)
    expect((await as(cookie).get(`/v1/admin/owners/${randomBytesUuid()}`)).statusCode).toBe(404)
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
