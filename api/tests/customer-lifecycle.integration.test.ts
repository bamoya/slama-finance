import { createHash, randomBytes } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/env.js'
import { createPasswordService } from '../src/lib/password.js'
import { tenantDatabase } from '../src/lib/tenant-database.js'
import { createTenantWorkerRunner } from '../src/lib/tenant-workers.js'
import { base32Decode, totp } from '../src/lib/totp.js'
import { createAdminAccounts } from '../src/modules/platform/administration/index.js'
import { createSubscriptionsModule } from '../src/modules/platform/subscriptions/index.js'
import {
  attachTestDatabase,
  isolatedDatabase,
  seedPaidCoverage,
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
    fixture = await isolatedDatabase({ owner: 'paid' })
    messages = []
    app = await buildApp({
      environment: loadEnvironment({
        NODE_ENV: 'test',
        OWNER_AUTH_ENABLED: 'true',
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
      url: '/api/v1/admin/auth/login',
      headers,
      payload: { email: adminEmail, password: adminPassword },
    })
    key = base32Decode(pending.json().enrollment.secret)
    const pendingCookie = pending.cookies.find((c) => c.name === 'slama_admin_session')!.value
    const done = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/2fa',
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

  const admin = (url: string, payload: object = {}, method: 'POST' | 'GET' = 'POST') =>
    app.inject({ method, url, headers, cookies: { slama_admin_session: cookie }, payload })
  const detail = async (id = testOwnerId) =>
    (await admin(`/api/v1/admin/owners/${id}`, {}, 'GET')).json()
  const audits = (action: string) =>
    fixture.client`select * from platform_admin_audit where action=${action} order by created_at`
  const staffLogin = (organizationId: string, email: string) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/organization-auth/login',
      headers: { ...headers, 'x-organization-id': organizationId },
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
        url: '/api/v1/organization-auth/session',
        headers: { 'x-organization-id': organizationId },
        cookies: { [c.name]: c.value },
      })
    ).statusCode === 200
  const ownerLogin = () =>
    app.inject({
      method: 'POST',
      url: '/api/v1/owner-auth/login',
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
    // Production eligibility: the subscriptions public API decides, featureless jobs included.
    const subscriptions = createSubscriptionsModule(() => fixture.db).publicApi
    await createTenantWorkerRunner(
      () => fixture.db,
      (feature) =>
        tenantDatabase(fixture.db).transaction((tx) => subscriptions.workerEligible(tx, feature)),
    )(async (id) => {
      visited.push(id)
    })
    return visited.sort()
  }

  it('blocks a customer with a reason, and payment never lifts it', async () => {
    const owner = await ownerCookie()
    const staff = await staffSession(testOrganizationId, 'staff-a@example.test')
    const url = `/api/v1/admin/owners/${testOwnerId}/block`
    expect((await admin(url, {})).statusCode).toBe(400)
    // Routine actions take no second factor: the strict contract rejects a code field.
    expect((await admin(url, { reason: secret, code: '000000' })).statusCode).toBe(400)
    const anonymous = await app.inject({
      method: 'POST',
      url,
      headers,
      payload: { reason: secret },
    })
    expect(anonymous.statusCode).toBe(401)
    expect(await audits('customer.block')).toHaveLength(0)

    const blocked = await admin(url, { reason: secret })
    expect(blocked.statusCode).toBe(200)
    expect(blocked.json().restriction).toMatchObject({ blockReason: secret })
    expect(blocked.json().restriction.blockedAt).toBeTruthy()
    // A repeated block is a conflict and writes no second audit row.
    expect((await admin(url, { reason: secret })).json().code).toBe('ALREADY_BLOCKED')
    const [row] = await audits('customer.block')
    expect(row!.before).toMatchObject({ blockedAt: null })
    expect(row!.after).toMatchObject({ reason: secret })

    expect((await ownerGet('/api/v1/owner-auth/session', owner)).statusCode).toBe(401)
    const login = await ownerLogin()
    expect(login.statusCode).toBe(401)
    expect(login.json().code).toBe('INVALID_CREDENTIALS')
    expect(await staffAlive(testOrganizationId, staff)).toBe(false)
    expect((await staffLogin(orgB, 'staff-b@example.test')).statusCode).toBe(403)
    expect(await visitedByWorkers()).toEqual([])

    const [payment] =
      await fixture.client`insert into subscription_payments(owner_id,plan_code,plan_version_id,cycle,kind,method,reference,currency,amount_ht,tax_amount,amount_ttc) values (${testOwnerId},'pro',(select plan_version_id from plan_selling where plan_code='pro'),'monthly','renewal','cash','after-block','MAD',100,0,100) returning id`
    expect(
      (
        await admin(`/api/v1/admin/payments/${payment!.id}/confirm`, {
          auditReason: 'receipt verified',
        })
      ).statusCode,
    ).toBe(200)
    expect((await detail()).restriction.blockedAt).toBeTruthy()
    expect((await ownerLogin()).statusCode).toBe(401)

    expect((await admin(`/api/v1/admin/owners/${testOwnerId}/unblock`, {})).statusCode).toBe(400)
    const unblocked = await admin(`/api/v1/admin/owners/${testOwnerId}/unblock`, {
      reason: 'paid',
    })
    expect(unblocked.json().restriction.blockedAt).toBeNull()
    expect(await audits('customer.unblock')).toHaveLength(1)
    const again = await ownerCookie()
    for (const path of [
      '/api/v1/owner-auth/session',
      '/api/v1/owner/organizations',
      '/api/v1/owner/subscription',
    ])
      expect((await ownerGet(path, again)).body).not.toContain(secret)
    expect((await staffLogin(testOrganizationId, 'staff-a@example.test')).statusCode).toBe(200)
  })

  it('suspends one organization without affecting the others', async () => {
    const staffA = await staffSession(testOrganizationId, 'staff-a@example.test')
    const staffB = await staffSession(orgB, 'staff-b@example.test')
    const response = await admin(`/api/v1/admin/organizations/${testOrganizationId}/suspend`, {
      reason: secret,
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
    const orgs = await ownerGet('/api/v1/owner/organizations', owner)
    expect(orgs.body).toContain('suspended')
    expect(orgs.body).not.toContain(secret)

    const [audit] = await audits('organization.suspend')
    expect(audit!.target_id).toBe(testOrganizationId)
    expect(
      (
        await admin(`/api/v1/admin/organizations/${testOrganizationId}/reactivate`, {
          reason: 'ok',
        })
      ).statusCode,
    ).toBe(200)
    expect((await staffLogin(testOrganizationId, 'staff-a@example.test')).statusCode).toBe(200)
    expect(
      (
        await admin(`/api/v1/admin/organizations/${testOrganizationId}/reactivate`, {
          reason: 'ok',
        })
      ).json().code,
    ).toBe('ORGANIZATION_NOT_SUSPENDED')
  })

  it('freezes coverage while the subscription is suspended and restores the exact time', async () => {
    await seedPaidCoverage(fixture.db, {
      ownerId: testOwnerId,
      planCode: 'pro',
      start: new Date(Date.now() - 15 * DAY),
      end: new Date(Date.now() + 20 * DAY),
      reference: 'cov',
    })
    const [before] =
      await fixture.client`select coverage_end from subscription_payments where reference='cov'`
    const suspended = await admin(`/api/v1/admin/owners/${testOwnerId}/subscription/suspend`, {
      reason: secret,
    })
    expect(suspended.statusCode).toBe(200)
    expect(suspended.json().subscription.status).toBe('suspended')
    expect(await visitedByWorkers()).toEqual([])
    const filtered = await admin('/api/v1/admin/owners?status=suspended', {}, 'GET')
    expect(filtered.json().items.map((i: { id: string }) => i.id)).toEqual([testOwnerId])
    expect((await admin('/api/v1/admin/owners?status=active', {}, 'GET')).json().total).toBe(0)
    expect((await admin('/api/v1/admin/overview', {}, 'GET')).json().suspended).toBe(1)
    const owner = await ownerCookie()
    const summary = await ownerGet('/api/v1/owner/subscription', owner)
    expect(summary.json().status).toBe('suspended')
    expect(summary.body).not.toContain(secret)

    // Pretend the suspension lasted ten days.
    // Both suspension histories move together (test-only trigger bypass for the append-only row).
    await fixture.client.begin(async (tx) => {
      await tx`set local session_replication_role = replica`
      await tx`update owner_subscriptions set suspended_at=suspended_at-interval '10 days' where owner_id=${testOwnerId}`
      await tx`update subscription_suspensions set started_at=started_at-interval '10 days' where owner_id=${testOwnerId} and ended_at is null`
    })
    const resumed = await admin(`/api/v1/admin/owners/${testOwnerId}/subscription/resume`, {
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
        await admin(`/api/v1/admin/owners/${testOwnerId}/block`, {
          reason: 'fraud',
        })
      ).statusCode,
    ).toBe(200)
    const scheduled = await admin(`/api/v1/admin/owners/${testOwnerId}/deletion`, {
      reason: secret,
    })
    expect(scheduled.statusCode).toBe(200)
    const restriction = scheduled.json().restriction
    expect(
      new Date(restriction.deletionDueAt).getTime() -
        new Date(restriction.deletionRequestedAt).getTime(),
    ).toBe(30 * DAY)
    expect(restriction.deletionReason).toBe(secret)
    const cancelled = await admin(`/api/v1/admin/owners/${testOwnerId}/deletion/cancel`, {
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
    await admin(`/api/v1/admin/owners/${testOwnerId}/unblock`, {
      reason: 'cleared',
    })
    await admin(`/api/v1/admin/owners/${testOwnerId}/deletion`, {
      reason: 'req',
    })
    expect((await ownerLogin()).statusCode).toBe(401)
    expect((await staffLogin(orgB, 'staff-b@example.test')).statusCode).toBe(403)
    await admin(`/api/v1/admin/owners/${testOwnerId}/deletion/cancel`, {
      reason: 'kept',
    })
    expect((await ownerLogin()).statusCode).toBe(200)
    expect((await staffLogin(orgB, 'staff-b@example.test')).statusCode).toBe(200)
  })

  it('changes the plan and extends coverage with audited zero-amount adjustments and periods', async () => {
    await seedPaidCoverage(fixture.db, {
      ownerId: testOwnerId,
      planCode: 'pro',
      start: new Date(Date.now() - 5 * DAY),
      end: new Date(Date.now() + 20 * DAY),
      reference: 'cov',
    })
    const url = `/api/v1/admin/owners/${testOwnerId}/subscription`
    expect((await admin(`${url}/plan`, { planCode: 'essential' })).statusCode).toBe(400)
    const changed = await admin(`${url}/plan`, {
      planCode: 'essential',
      reason: 'downgrade',
    })
    expect(changed.statusCode).toBe(200)
    expect(changed.json().subscription.planCode).toBe('essential')
    // S5b dual write: the legacy zero-value adjustment and its complimentary period (with the note).
    const adjustment = changed
      .json()
      .payments.find((p: { method: string }) => p.method === 'admin_adjustment')
    expect(adjustment).toMatchObject({ status: 'confirmed', amount: { amountTtc: 0 } })
    const [granted] =
      await fixture.client`select p.kind, p.plan_code, p.source, p.payment_id, n.reason, n.created_by from subscription_periods p join subscription_period_notes n on n.period_id=p.id where p.owner_id=${testOwnerId}`
    expect(granted).toMatchObject({
      kind: 'complimentary',
      plan_code: 'essential',
      source: 'admin_grant',
      payment_id: adjustment.id,
      reason: 'downgrade',
    })
    expect(granted!.created_by).not.toBeNull()
    expect((await admin(`${url}/plan`, { planCode: 'essential', reason: 'x' })).json().code).toBe(
      'SAME_PLAN',
    )
    const before = new Date(changed.json().subscription.paidThroughAt).getTime()
    expect((await admin(`${url}/extension`, { days: 0, reason: 'x' })).statusCode).toBe(400)
    const extended = await admin(`${url}/extension`, {
      days: 10,
      reason: 'goodwill',
    })
    expect(new Date(extended.json().subscription.paidThroughAt).getTime() - before).toBe(10 * DAY)
    expect(await audits('subscription.change_plan')).toHaveLength(1)
    const [audit] = await audits('subscription.extend')
    expect(audit!.after).toMatchObject({ days: 10, reason: 'goodwill' })
    expect(audit!.after).not.toHaveProperty('code')
    const owner = await ownerCookie()
    const payments = await ownerGet('/api/v1/owner/subscription/payments', owner)
    expect(payments.body).not.toContain('goodwill')
    expect(payments.body).not.toContain('downgrade')
  })

  it.each(['unblock', 'cancel-deletion', 'reactivate'] as const)(
    'restores %s access atomically under the admin session',
    async (operation) => {
      const setupUrl =
        operation === 'reactivate'
          ? `/api/v1/admin/organizations/${testOrganizationId}/suspend`
          : `/api/v1/admin/owners/${testOwnerId}/${operation === 'unblock' ? 'block' : 'deletion'}`
      expect((await admin(setupUrl, { reason: 'restrict' })).statusCode).toBe(200)
      const url =
        operation === 'reactivate'
          ? `/api/v1/admin/organizations/${testOrganizationId}/reactivate`
          : `/api/v1/admin/owners/${testOwnerId}/${operation === 'unblock' ? 'unblock' : 'deletion/cancel'}`
      const action = {
        unblock: 'customer.unblock',
        'cancel-deletion': 'customer.delete_cancel',
        reactivate: 'organization.reactivate',
      }[operation]
      const snapshot = async () =>
        JSON.stringify(
          await fixture.client.unsafe(`select row_to_json(t) from
        (select id,blocked_at,deletion_requested_at,deletion_due_at from platform_users where id='${testOwnerId}') t`),
        ) +
        JSON.stringify(
          await fixture.client`select id,suspended_at from organizations order by id`,
        ) +
        JSON.stringify(await audits(action))
      const before = await snapshot()
      expect((await admin(url, {})).statusCode).toBe(400)
      expect((await admin(url, { reason: '   ' })).statusCode).toBe(400)
      expect((await admin(url, { reason: 'restore', code: '123456' })).statusCode).toBe(400)
      const anonymous = await app.inject({ method: 'POST', url, headers, payload: { reason: 'r' } })
      expect(anonymous.statusCode).toBe(401)
      expect(await snapshot()).toBe(before)
      await fixture.client
        .unsafe(`create function reject_restore_audit() returns trigger language plpgsql as $$
        begin if NEW.action='${action}' then raise exception 'test audit failure'; end if; return NEW; end $$`)
      await fixture.client.unsafe(
        'create trigger reject_restore_audit before insert on platform_admin_audit for each row execute function reject_restore_audit()',
      )
      expect((await admin(url, { reason: 'restore' })).statusCode).toBe(500)
      expect(await snapshot()).toBe(before)
      await fixture.client.unsafe('drop trigger reject_restore_audit on platform_admin_audit')
      expect((await admin(url, { reason: 'restore' })).statusCode).toBe(200)
      const [actor] = await fixture.client`select id from platform_admins where email=${adminEmail}`
      const [audit] = await audits(action)
      expect(audit).toMatchObject({
        admin_id: actor!.id,
        actor: adminEmail,
        after: { reason: 'restore' },
      })
      expect(audit!.after).not.toHaveProperty('code')
      const committed = await snapshot()
      // Replaying the request is a state conflict and changes nothing.
      const replay = await admin(url, { reason: 'restore' })
      expect(replay.statusCode).toBe(409)
      expect(await snapshot()).toBe(committed)
    },
  )

  it.each(['plan', 'extension', 'resume', 'paid-owner'] as const)(
    'commits %s coverage, actor and audit atomically under the admin session',
    async (operation) => {
      if (operation === 'resume') {
        const suspended = await admin(`/api/v1/admin/owners/${testOwnerId}/subscription/suspend`, {
          reason: 'pause',
        })
        expect(suspended.statusCode).toBe(200)
      }
      const action = {
        plan: 'subscription.change_plan',
        extension: 'subscription.extend',
        resume: 'subscription.resume',
        'paid-owner': 'customer.create',
      }[operation]
      const url =
        operation === 'paid-owner'
          ? '/api/v1/admin/owners'
          : `/api/v1/admin/owners/${testOwnerId}/subscription/${operation}`
      const payload = {
        plan: { planCode: 'essential', reason: 'coverage approval' },
        extension: { days: 10, reason: 'coverage approval' },
        resume: { reason: 'coverage approval' },
        'paid-owner': {
          firstName: 'Paid',
          lastName: 'Owner',
          email: 'atomic@example.test',
          locale: 'fr',
          reason: 'coverage approval',
          subscription: {
            kind: 'paid',
            planCode: 'business',
            cycle: 'monthly',
            coverageStart: new Date(Date.now() - DAY).toISOString(),
            coverageEnd: new Date(Date.now() + 30 * DAY).toISOString(),
          },
        },
      }[operation]
      const snapshot = async () => {
        const tables = [
          'platform_users',
          'owner_subscriptions',
          'subscription_payments',
          'subscription_periods',
          'subscription_period_notes',
          'subscription_suspensions',
          'subscription_scheduled_changes',
          'owner_account_tokens',
          'platform_admin_audit',
        ]
        return Promise.all(
          tables.map(async (table) =>
            JSON.stringify(
              await fixture.client.unsafe(`select * from ${table} t order by row_to_json(t)::text`),
            ),
          ),
        )
      }
      const before = await snapshot()
      expect((await admin(url, { ...payload, code: '123456' })).statusCode).toBe(400)
      const anonymous = await app.inject({ method: 'POST', url, headers, payload })
      expect(anonymous.statusCode).toBe(401)
      expect(await snapshot()).toEqual(before)

      // Fail after the mutation, at the audit insert, to verify the entire transaction rolls back.
      await fixture.client
        .unsafe(`create function reject_coverage_audit() returns trigger language plpgsql as $$
        begin if NEW.action = '${action}' then raise exception 'test audit failure'; end if; return NEW; end $$`)
      await fixture.client
        .unsafe(`create trigger reject_coverage_audit before insert on platform_admin_audit
        for each row execute function reject_coverage_audit()`)
      const failed = await admin(url, payload)
      expect(failed.statusCode, failed.body).toBe(500)
      expect(await snapshot()).toEqual(before)
      expect(messages).toHaveLength(0)
      await fixture.client.unsafe('drop trigger reject_coverage_audit on platform_admin_audit')
      const success = await admin(url, payload)
      expect(success.statusCode, success.body).toBe(operation === 'paid-owner' ? 201 : 200)
      const [actor] = await fixture.client`select id from platform_admins where email=${adminEmail}`
      const [audit] = await audits(action)
      expect(audit).toMatchObject({
        admin_id: actor!.id,
        actor: adminEmail,
        target_id: success.json().owner.id,
        after: { reason: 'coverage approval' },
      })
      if (operation !== 'resume') {
        const notes =
          await fixture.client`select n.created_by,n.reason from subscription_period_notes n
          join subscription_periods p on p.id=n.period_id where p.owner_id=${success.json().owner.id}`
        expect(notes).toContainEqual({ created_by: actor!.id, reason: 'coverage approval' })
      }
      // Replays: state conflicts change nothing; an extension is additive by design.
      if (operation !== 'extension') {
        const committed = await snapshot()
        const replay = await admin(url, payload)
        expect(replay.statusCode).toBe(409)
        expect(await snapshot()).toEqual(committed)
      }
    },
  )

  it('creates customers with single-use, expiring invitations and resends', async () => {
    const create = async (
      email: string,
      subscription: { kind: string; [key: string]: unknown } = { kind: 'trial' },
    ) =>
      admin('/api/v1/admin/owners', {
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
    expect(
      (await admin(`/api/v1/admin/owners/${id}/invitation`, { reason: 'lost' })).statusCode,
    ).toBe(204)
    const first = tokenOf(messages[0]!)
    const second = tokenOf(messages[1]!)
    const post = (path: string, payload: object) =>
      app.inject({ method: 'POST', url: `/api/v1/owner-auth/invitation/${path}`, headers, payload })
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
      url: '/api/v1/owner-auth/login',
      headers,
      payload: { email: 'new@example.test', password: ownerPassword },
    })
    expect(login.statusCode).toBe(200)
    expect((await detail(id)).invitationPending).toBe(false)
    expect(
      (await admin(`/api/v1/admin/owners/${id}/invitation`, { reason: 'x' })).json().code,
    ).toBe('INVITATION_NOT_PENDING')

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

  it('renames an organization address, keeps the old one redirecting and revokes sessions', async () => {
    const staffA = await staffSession(testOrganizationId, 'staff-a@example.test')
    const rename = (body: Record<string, unknown>, id = testOrganizationId) =>
      admin(`/api/v1/admin/organizations/${id}/slug`, body)
    for (const [slug, code] of [
      ['ab', 'SLUG_INVALID'],
      ['support', 'SLUG_RESERVED'],
      ['  API ', 'SLUG_RESERVED'],
    ] as const) {
      const response = await rename({ slug, reason: 'r' })
      expect(response.statusCode, slug).toBe(400)
      expect(response.json().code).toBe(code)
    }
    const taken = await rename({ slug: 'second', reason: 'r' })
    expect(taken.statusCode).toBe(409)
    expect(taken.json().code).toBe('SLUG_TAKEN')
    expect(
      (await rename({ slug: 'Atelier Neuf', reason: 'rebrand', code: '000000' })).statusCode,
    ).toBe(400)
    const renamed = await rename({ slug: 'Atelier Neuf', reason: secret })
    expect(renamed.statusCode, renamed.body).toBe(200)
    expect(
      (await fixture.client`select slug from organizations where id=${testOrganizationId}`)[0]!
        .slug,
    ).toBe('atelier-neuf')
    expect(
      await fixture.client`select slug,organization_id from organization_slug_history`,
    ).toEqual([{ slug: 'fixture', organization_id: testOrganizationId }])
    const [audit] = await audits('organization.rename_slug')
    expect(audit).toMatchObject({ before: { slug: 'fixture' }, after: { slug: 'atelier-neuf' } })
    expect(await staffAlive(testOrganizationId, staffA)).toBe(false)
    // The old host no longer serves the API but tells the UI where the organization moved.
    const old = await app.inject({
      url: '/api/v1/organization-auth/session',
      headers: { host: 'fixture.localhost:5173' },
    })
    expect(old.statusCode).toBe(404)
    const site = await app.inject({
      url: '/api/v1/public/site',
      headers: { host: 'fixture.localhost:5173' },
    })
    expect(site.json()).toEqual({
      kind: 'organization',
      organization: null,
      redirectTo: 'http://atelier-neuf.localhost:5173',
    })
    const current = await app.inject({
      url: '/api/v1/public/site',
      headers: { host: 'atelier-neuf.localhost:5173' },
    })
    expect(current.json()).toEqual({
      kind: 'organization',
      organization: { slug: 'atelier-neuf', name: 'Fixture' },
      redirectTo: null,
    })
    // A former address stays unavailable to other organizations but the owner may take it back.
    const stolen = await rename({ slug: 'fixture', reason: 'r' }, orgB)
    expect(stolen.json().code).toBe('SLUG_TAKEN')
    const back = await rename({ slug: 'fixture', reason: 'r' })
    expect(back.statusCode, back.body).toBe(200)
    expect(await fixture.client`select slug from organization_slug_history order by slug`).toEqual([
      { slug: 'atelier-neuf' },
    ])
    // Owners cannot change the address themselves, even with a column grant on the table.
    await fixture.client.unsafe(`GRANT UPDATE ON organizations TO "${fixture.role}"`)
    await expect(
      fixture.db.transaction(async (tx) => {
        await tx.execute(sql`set local role ${sql.raw(`"${fixture.role}"`)}`)
        await tx.execute(
          sql`select set_config('app.actor_type','owner',true),set_config('app.owner_id',${testOwnerId},true)`,
        )
        await tx.execute(
          sql`update organizations set slug='owner-pick' where id=${testOrganizationId}`,
        )
      }),
    ).rejects.toThrow(/administrator context required/)
  })

  it('resolves legacy organization links only for active organizations', async () => {
    const address = (id: string) =>
      app.inject({
        url: `/api/v1/public/organizations/${id}/address`,
        headers: { host: 'localhost:5173' },
      })
    expect((await address(testOrganizationId)).json()).toEqual({
      url: 'http://fixture.localhost:5173',
    })
    const onOrganizationHost = await app.inject({
      url: `/api/v1/public/organizations/${orgB}/address`,
      headers: { host: 'second.localhost:5173' },
    })
    expect(onOrganizationHost.json()).toEqual({ url: 'http://second.localhost:5173' })
    const unknown = await address('10000000-0000-4000-8000-0000000000ff')
    expect(unknown.statusCode).toBe(404)
    await admin(`/api/v1/admin/organizations/${orgB}/suspend`, {
      reason: 'r',
    })
    const suspended = await address(orgB)
    expect(suspended.statusCode).toBe(404)
    expect(suspended.body).toBe(
      unknown.body.replace(unknown.json().requestId, suspended.json().requestId),
    )
    expect(
      (
        await app.inject({ url: '/api/v1/public/site', headers: { host: 'localhost:5173' } })
      ).json(),
    ).toEqual({ kind: 'public', organization: null, redirectTo: null })
  })
})
