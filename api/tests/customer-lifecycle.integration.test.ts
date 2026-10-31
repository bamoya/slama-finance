import { createHash, randomBytes } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/env.js'
import { createTenantWorkerRunner } from '../src/lib/tenant-workers.js'
import { createPasswordService } from '../src/lib/password.js'
import { base32Decode, totp } from '../src/lib/totp.js'
import { createAdminAccounts } from '../src/modules/platform/administration/index.js'
import {
  attachTestDatabase,
  isolatedDatabase,
  testOrganizationId,
  testOwnerId,
} from './helpers/postgres.js'

const origin = 'http://localhost:5173'
const headers = { origin }
const adminEmail = 'ops@example.test'
const adminPassword = 'admin-password-2026'
const ownerPassword = 'owner-password-2026'
const staffPassword = 'staff-password-2026'
const secret = 'INTERNAL-NOTE-7f3a'
const DAY = 86_400_000
const sha = (value: string) => createHash('sha256').update(value).digest('hex')
type Message = { to: string; url: string; purpose: string; expiresAt: Date; language: string }
const tokenOf = (message: Message) =>
  new URLSearchParams(new URL(message.url).hash.slice(1)).get('token')!

describe('Customer lifecycle administration', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let app: Awaited<ReturnType<typeof buildApp>>
  let messages: Message[]
  let cookie: string
  let key: Buffer
  const orgB = '10000000-0000-4000-8000-0000000000b2'

  beforeEach(async () => {
    fixture = await isolatedDatabase()
    messages = []
    app = await buildApp({
      environment: loadEnvironment({
        NODE_ENV: 'test',
        OWNER_AUTH_ENABLED: 'true',
        OWNER_PORTAL_ORIGIN: origin,
        CORS_ORIGIN: origin,
        ADMIN_TOTP_KEY: randomBytes(32).toString('base64'),
      }),
      logger: false,
      ownerAccountDelivery: {
        async send(message) {
          messages.push(message)
        },
      },
    })
    attachTestDatabase(app, fixture)
    await createAdminAccounts(() => fixture.db).create({
      email: adminEmail,
      name: 'Ops',
      password: adminPassword,
    })
    const passwords = createPasswordService()
    await fixture.client`update platform_users set password_hash=${await passwords.hash(ownerPassword)},email_verified_at=now() where id=${testOwnerId}`
    await fixture.client`insert into organizations(id,owner_id,name,slug,activated_at) values (${orgB},${testOwnerId},'Second','second',now())`
    const hash = await passwords.hash(staffPassword)
    await fixture.client`insert into users(organization_id,email,password_hash,must_change_password) values (${testOrganizationId},'staff-a@example.test',${hash},false),(${orgB},'staff-b@example.test',${hash},false)`
    const pending = await app.inject({
      method: 'POST',
      url: '/v1/admin/auth/login',
      headers,
      payload: { email: adminEmail, password: adminPassword },
    })
    key = base32Decode(pending.json().enrollment.secret)
    const pendingCookie = pending.cookies.find((c) => c.name === 'slama_admin_session')!.value
    const done = await app.inject({
      method: 'POST',
      url: '/v1/admin/auth/2fa',
      headers,
      cookies: { slama_admin_session: pendingCookie },
      payload: { code: totp(key, Date.now() - 30_000) },
    })
    expect(done.statusCode).toBe(200)
    cookie = done.cookies.find((c) => c.name === 'slama_admin_session')!.value
  })
  afterEach(async () => {
    await app?.close()
    await fixture?.cleanup()
  })

  /**
   * Each code is accepted once and only for a newer time step; tests run faster than 30 s steps,
   * so the replay marker is cleared before minting another code (replay itself is tested below).
   */
  async function freshCode() {
    await fixture.client`update platform_admins set totp_last_step=null`
    return totp(key, Date.now())
  }
  const admin = (url: string, payload: object = {}, method: 'POST' | 'GET' = 'POST') =>
    app.inject({ method, url, headers, cookies: { slama_admin_session: cookie }, payload })
  const detail = async (id = testOwnerId) =>
    (await admin(`/v1/admin/owners/${id}`, {}, 'GET')).json()
  const audits = (action: string) =>
    fixture.client`select * from platform_admin_audit where action=${action} order by created_at`
  const staffLogin = (organizationId: string, email: string) =>
    app.inject({
      method: 'POST',
      url: `/v1/organizations/${organizationId}/auth/login`,
      headers,
      payload: { email, password: staffPassword },
    })
  async function staffSession(organizationId: string, email: string) {
    const response = await staffLogin(organizationId, email)
    expect(response.statusCode).toBe(200)
    return response.cookies.find((c) => c.name.startsWith('slama_'))!
  }
  const staffAlive = async (organizationId: string, c: { name: string; value: string }) =>
    (
      await app.inject({
        method: 'GET',
        url: `/v1/organizations/${organizationId}/auth/session`,
        cookies: { [c.name]: c.value },
      })
    ).statusCode === 200
  const ownerLogin = () =>
    app.inject({
      method: 'POST',
      url: '/v1/owner-auth/login',
      headers,
      payload: { email: 'fixture-owner@example.test', password: ownerPassword },
    })
  async function ownerCookie() {
    const response = await ownerLogin()
    expect(response.statusCode).toBe(200)
    return response.cookies.find((c) => c.name === 'slama_owner_session')!.value
  }
  const ownerGet = (url: string, value: string) =>
    app.inject({ method: 'GET', url, cookies: { slama_owner_session: value } })
  async function visitedByWorkers() {
    const visited: string[] = []
    await createTenantWorkerRunner(() => fixture.db)(async (id) => {
      visited.push(id)
    })
    return visited.sort()
  }

  it('blocks a customer with 2FA and a reason, and payment never lifts it', async () => {
    const owner = await ownerCookie()
    const staff = await staffSession(testOrganizationId, 'staff-a@example.test')
    const url = `/v1/admin/owners/${testOwnerId}/block`
    expect((await admin(url, { reason: secret })).statusCode).toBe(400)
    expect((await admin(url, { code: await freshCode() })).statusCode).toBe(400)
    const wrong = await admin(url, { reason: secret, code: '000000' })
    expect(wrong.statusCode).toBe(403)
    expect(wrong.json().code).toBe('TWO_FACTOR_INVALID')
    expect(await audits('customer.block')).toHaveLength(0)

    const code = await freshCode()
    const blocked = await admin(url, { reason: secret, code })
    expect(blocked.statusCode).toBe(200)
    expect(blocked.json().restriction).toMatchObject({ blockReason: secret })
    expect(blocked.json().restriction.blockedAt).toBeTruthy()
    // Replayed code is refused.
    expect(
      (await admin(`/v1/admin/owners/${testOwnerId}/deletion`, { reason: 'x', code })).json().code,
    ).toBe('TWO_FACTOR_INVALID')
    const [row] = await audits('customer.block')
    expect(row!.before).toMatchObject({ blockedAt: null })
    expect(row!.after).toMatchObject({ reason: secret })

    expect((await ownerGet('/v1/owner-auth/session', owner)).statusCode).toBe(401)
    const login = await ownerLogin()
    expect(login.statusCode).toBe(401)
    expect(login.json().code).toBe('INVALID_CREDENTIALS')
    expect(await staffAlive(testOrganizationId, staff)).toBe(false)
    expect((await staffLogin(orgB, 'staff-b@example.test')).statusCode).toBe(403)
    expect(await visitedByWorkers()).toEqual([])

    const [payment] =
      await fixture.client`insert into subscription_payments(owner_id,plan_code,cycle,kind,method,reference,currency,amount_ht,tax_amount,amount_ttc) values (${testOwnerId},'pro','monthly','renewal','cash','after-block','MAD',100,0,100) returning id`
    expect((await admin(`/v1/admin/payments/${payment!.id}/confirm`)).statusCode).toBe(200)
    expect((await detail()).restriction.blockedAt).toBeTruthy()
    expect((await ownerLogin()).statusCode).toBe(401)

    expect((await admin(`/v1/admin/owners/${testOwnerId}/unblock`, {})).statusCode).toBe(400)
    const unblocked = await admin(`/v1/admin/owners/${testOwnerId}/unblock`, { reason: 'paid' })
    expect(unblocked.json().restriction.blockedAt).toBeNull()
    expect(await audits('customer.unblock')).toHaveLength(1)
    const again = await ownerCookie()
    for (const path of [
      '/v1/owner-auth/session',
      '/v1/owner/organizations',
      '/v1/owner/subscription',
    ])
      expect((await ownerGet(path, again)).body).not.toContain(secret)
    expect((await staffLogin(testOrganizationId, 'staff-a@example.test')).statusCode).toBe(200)
  })

  it('suspends one organization without affecting the others', async () => {
    const staffA = await staffSession(testOrganizationId, 'staff-a@example.test')
    const staffB = await staffSession(orgB, 'staff-b@example.test')
    const response = await admin(`/v1/admin/organizations/${testOrganizationId}/suspend`, {
      reason: secret,
      code: await freshCode(),
    })
    expect(response.statusCode).toBe(200)
    const org = response
      .json()
      .organizations.find((o: { id: string }) => o.id === testOrganizationId)
    expect(org).toMatchObject({ state: 'suspended', suspensionReason: secret })
    expect(await staffAlive(testOrganizationId, staffA)).toBe(false)
    expect(await staffAlive(orgB, staffB)).toBe(true)
    const rejected = await staffLogin(testOrganizationId, 'staff-a@example.test')
    expect(rejected.statusCode).toBe(403)
    expect(rejected.body).not.toContain(secret)
    expect(await visitedByWorkers()).toEqual([orgB].sort())
    const owner = await ownerCookie()
    const orgs = await ownerGet('/v1/owner/organizations', owner)
    expect(orgs.body).toContain('suspended')
    expect(orgs.body).not.toContain(secret)

    const [audit] = await audits('organization.suspend')
    expect(audit!.target_id).toBe(testOrganizationId)
    expect(
      (await admin(`/v1/admin/organizations/${testOrganizationId}/reactivate`, { reason: 'ok' }))
        .statusCode,
    ).toBe(200)
    expect((await staffLogin(testOrganizationId, 'staff-a@example.test')).statusCode).toBe(200)
    expect(
      (
        await admin(`/v1/admin/organizations/${testOrganizationId}/reactivate`, { reason: 'ok' })
      ).json().code,
    ).toBe('ORGANIZATION_NOT_SUSPENDED')
  })

  it('freezes coverage while the subscription is suspended and restores the exact time', async () => {
    await fixture.client`insert into subscription_payments(owner_id,plan_code,cycle,kind,method,reference,currency,amount_ht,tax_amount,amount_ttc,status,coverage_start,coverage_end,decided_at) values (${testOwnerId},'pro','monthly','activation','cash','cov','MAD',100,0,100,'confirmed',now()-interval '15 days',now()+interval '20 days',now())`
    const [before] =
      await fixture.client`select coverage_end from subscription_payments where reference='cov'`
    const suspended = await admin(`/v1/admin/owners/${testOwnerId}/subscription/suspend`, {
      reason: secret,
      code: await freshCode(),
    })
    expect(suspended.statusCode).toBe(200)
    expect(suspended.json().subscription.status).toBe('suspended')
    expect(await visitedByWorkers()).toEqual([])
    const filtered = await admin('/v1/admin/owners?status=suspended', {}, 'GET')
    expect(filtered.json().items.map((i: { id: string }) => i.id)).toEqual([testOwnerId])
    expect((await admin('/v1/admin/owners?status=active', {}, 'GET')).json().total).toBe(0)
    expect((await admin('/v1/admin/overview', {}, 'GET')).json().suspended).toBe(1)
    const owner = await ownerCookie()
    const summary = await ownerGet('/v1/owner/subscription', owner)
    expect(summary.json().status).toBe('suspended')
    expect(summary.body).not.toContain(secret)

    // Pretend the suspension lasted ten days.
    await fixture.client`update owner_subscriptions set suspended_at=suspended_at-interval '10 days' where owner_id=${testOwnerId}`
    const resumed = await admin(`/v1/admin/owners/${testOwnerId}/subscription/resume`, {
      reason: 'ok',
    })
    expect(resumed.statusCode).toBe(200)
    expect(resumed.json().subscription.status).toBe('active')
    const [after] =
      await fixture.client`select coverage_end from subscription_payments where reference='cov'`
    const shift = new Date(after!.coverage_end).getTime() - new Date(before!.coverage_end).getTime()
    expect(Math.abs(shift - 10 * DAY)).toBeLessThan(10_000)
    const [audit] = await audits('subscription.resume')
    expect(audit!.before).toMatchObject({ status: 'suspended' })
    expect(audit!.after).toMatchObject({ status: 'active', reason: 'ok' })
    expect(await visitedByWorkers()).toEqual([orgB, testOrganizationId].sort())
  })

  it('schedules deletion and cancellation restores the previous restriction', async () => {
    expect(
      (
        await admin(`/v1/admin/owners/${testOwnerId}/block`, {
          reason: 'fraud',
          code: await freshCode(),
        })
      ).statusCode,
    ).toBe(200)
    const scheduled = await admin(`/v1/admin/owners/${testOwnerId}/deletion`, {
      reason: secret,
      code: await freshCode(),
    })
    expect(scheduled.statusCode).toBe(200)
    const restriction = scheduled.json().restriction
    expect(
      new Date(restriction.deletionDueAt).getTime() -
        new Date(restriction.deletionRequestedAt).getTime(),
    ).toBe(30 * DAY)
    expect(restriction.deletionReason).toBe(secret)
    const cancelled = await admin(`/v1/admin/owners/${testOwnerId}/deletion/cancel`, {
      reason: 'mistake',
    })
    expect(cancelled.json().restriction).toMatchObject({
      deletionRequestedAt: null,
      deletionDueAt: null,
      blockReason: 'fraud',
    })
    expect(cancelled.json().restriction.blockedAt).toBeTruthy()
    expect((await ownerLogin()).statusCode).toBe(401)
    expect(await audits('customer.delete_cancel')).toHaveLength(1)

    // Without an earlier restriction, cancelling restores full access.
    await admin(`/v1/admin/owners/${testOwnerId}/unblock`, { reason: 'cleared' })
    await admin(`/v1/admin/owners/${testOwnerId}/deletion`, {
      reason: 'req',
      code: await freshCode(),
    })
    expect((await ownerLogin()).statusCode).toBe(401)
    expect((await staffLogin(orgB, 'staff-b@example.test')).statusCode).toBe(403)
    await admin(`/v1/admin/owners/${testOwnerId}/deletion/cancel`, { reason: 'kept' })
    expect((await ownerLogin()).statusCode).toBe(200)
    expect((await staffLogin(orgB, 'staff-b@example.test')).statusCode).toBe(200)
  })

  it('changes the plan and extends coverage with audited zero-amount adjustments', async () => {
    await fixture.client`insert into subscription_payments(owner_id,plan_code,cycle,kind,method,reference,currency,amount_ht,tax_amount,amount_ttc,status,coverage_start,coverage_end,decided_at) values (${testOwnerId},'pro','monthly','activation','cash','cov','MAD',100,0,100,'confirmed',now()-interval '5 days',now()+interval '20 days',now())`
    const url = `/v1/admin/owners/${testOwnerId}/subscription`
    expect((await admin(`${url}/plan`, { planCode: 'essential' })).statusCode).toBe(400)
    const changed = await admin(`${url}/plan`, { planCode: 'essential', reason: 'downgrade' })
    expect(changed.statusCode).toBe(200)
    expect(changed.json().subscription.planCode).toBe('essential')
    expect(
      changed.json().payments.find((p: { method: string }) => p.method === 'admin_adjustment'),
    ).toMatchObject({
      method: 'admin_adjustment',
      status: 'confirmed',
      amount: { amountTtc: 0 },
    })
    expect((await admin(`${url}/plan`, { planCode: 'essential', reason: 'x' })).json().code).toBe(
      'SAME_PLAN',
    )
    const before = new Date(changed.json().subscription.paidThroughAt).getTime()
    expect((await admin(`${url}/extension`, { days: 0, reason: 'x' })).statusCode).toBe(400)
    const extended = await admin(`${url}/extension`, { days: 10, reason: 'goodwill' })
    expect(new Date(extended.json().subscription.paidThroughAt).getTime() - before).toBe(10 * DAY)
    expect(await audits('subscription.change_plan')).toHaveLength(1)
    const [audit] = await audits('subscription.extend')
    expect(audit!.after).toMatchObject({ days: 10, reason: 'goodwill' })
    const owner = await ownerCookie()
    const payments = await ownerGet('/v1/owner/subscription/payments', owner)
    expect(payments.body).not.toContain('goodwill')
    expect(payments.body).not.toContain('downgrade')
  })

  it('creates customers with single-use, expiring invitations and resends', async () => {
    const create = (email: string, subscription: object = { kind: 'trial' }) =>
      admin('/v1/admin/owners', {
        firstName: 'Nadia',
        lastName: 'Alaoui',
        email,
        locale: 'en',
        subscription,
        reason: 'signed contract',
      })
    const created = await create('New@Example.Test')
    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({
      invitationPending: true,
      organizations: [],
      subscription: { status: 'not_started' },
    })
    expect((await create('new@example.test')).json().code).toBe('EMAIL_TAKEN')
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      to: 'new@example.test',
      purpose: 'invitation',
      language: 'en',
    })
    expect(messages[0]!.expiresAt.getTime() - Date.now()).toBeGreaterThan(71 * 3_600_000)
    const id = created.json().owner.id
    const [stored] =
      await fixture.client`select token_hash from owner_account_tokens where owner_id=${id}`
    expect(stored!.token_hash).toBe(sha(tokenOf(messages[0]!)))
    expect(await audits('customer.create')).toHaveLength(1)

    // Resend invalidates the previous link.
    expect((await admin(`/v1/admin/owners/${id}/invitation`, { reason: 'lost' })).statusCode).toBe(
      204,
    )
    const first = tokenOf(messages[0]!)
    const second = tokenOf(messages[1]!)
    const post = (path: string, payload: object) =>
      app.inject({ method: 'POST', url: `/v1/owner-auth/invitation/${path}`, headers, payload })
    expect((await post('inspect', { token: first })).json().code).toBe('INVALID_INVITATION_TOKEN')
    expect((await post('inspect', { token: second })).json()).toEqual({
      email: 'new@example.test',
      firstName: 'Nadia',
      lastName: 'Alaoui',
      locale: 'en',
    })
    expect((await post('accept', { token: first, password: ownerPassword })).statusCode).toBe(400)
    expect((await post('accept', { token: second, password: ownerPassword })).statusCode).toBe(204)
    expect(
      (await post('accept', { token: second, password: 'another-password-1' })).statusCode,
    ).toBe(400)
    const login = await app.inject({
      method: 'POST',
      url: '/v1/owner-auth/login',
      headers,
      payload: { email: 'new@example.test', password: ownerPassword },
    })
    expect(login.statusCode).toBe(200)
    expect((await detail(id)).invitationPending).toBe(false)
    expect((await admin(`/v1/admin/owners/${id}/invitation`, { reason: 'x' })).json().code).toBe(
      'INVITATION_NOT_PENDING',
    )

    // Expired links are refused.
    const paid = await create('paid@example.test', {
      kind: 'paid',
      planCode: 'business',
      cycle: 'annual',
      coverageStart: new Date(Date.now() - DAY).toISOString(),
      coverageEnd: new Date(Date.now() + 365 * DAY).toISOString(),
    })
    expect(paid.statusCode).toBe(201)
    expect(paid.json().subscription).toMatchObject({ status: 'active', planCode: 'business' })
    await fixture.client`update owner_account_tokens set expires_at=now()-interval '1 second' where owner_id=${paid.json().owner.id}`
    expect((await post('inspect', { token: tokenOf(messages.at(-1)!) })).statusCode).toBe(400)
    const incomplete = await create('bad@example.test', { kind: 'paid', planCode: 'pro' })
    expect(incomplete.json().code).toBe('INVALID_SUBSCRIPTION')
  })
})
