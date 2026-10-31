import { createHash, randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/env.js'
import type { OwnerOnboarding } from '../src/contracts/generated/identity/owner-onboarding.schemas.js'
import type { OrganizationAdminDelivery } from '../src/integrations/contracts.js'
import type { Database, Transaction } from '../src/lib/db.js'
import { tenantDatabase } from '../src/lib/tenant-database.js'
import { createIdentityModule } from '../src/modules/organization/identity/index.js'
import { isolatedDatabase } from './helpers/postgres.js'
const origin = 'http://localhost:5173'
describe('Owner activation, workspace access and admission limits', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>,
    app: Awaited<ReturnType<typeof buildApp>>,
    ownerId: string,
    token: string
  beforeEach(async () => {
    fixture = await isolatedDatabase()
    ownerId = randomUUID()
    token = 'a'.repeat(43)
    await fixture.client`insert into platform_users(id,email,password_hash,email_verified_at,first_name,last_name) values(${ownerId},'owner@company.test','not-a-password-hash',now(),'Owner','Test')`
    await fixture.client`insert into owner_sessions(owner_id,token_hash,expires_at) values(${ownerId},${createHash('sha256').update(token).digest('hex')},now()+interval '1 day')`
    const [schema] = await fixture.client`select current_schema() n`
    await fixture.client.unsafe(
      `GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA "${schema!.n}" TO "${fixture.role}"`,
    )
    const runtime = new Proxy(fixture.db, {
      get(target, key) {
        if (key === 'transaction')
          return <T>(
            work: (tx: Transaction) => Promise<T>,
            config?: Parameters<Database['transaction']>[1],
          ) =>
            target.transaction(async (tx) => {
              await tx.execute(sql.raw(`set local role "${fixture.role}"`))
              await tx.execute(sql`select set_config('app.organization_id','',true)`)
              return work(tx)
            }, config)
        const value: unknown = Reflect.get(target, key)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    app = await buildApp({
      logger: false,
      environment: loadEnvironment({
        NODE_ENV: 'test',
        OWNER_AUTH_ENABLED: 'true',
        OWNER_PORTAL_ORIGIN: origin,
      }),
    })
    app.database = () => runtime
  })
  afterEach(async () => {
    await app?.close()
    await fixture?.cleanup()
  })
  const request = (
    method: 'GET' | 'POST' | 'PUT',
    url: string,
    body?: object,
    orgId?: string,
    ownerToken = token,
  ) =>
    app.inject({
      method,
      url,
      payload: body,
      cookies: { slama_owner_session: ownerToken },
      headers: {
        origin,
        ...(orgId ? { 'x-organization-id': orgId, 'x-workspace-identity': 'owner' } : {}),
      },
    })
  const create = async () => {
    const r = await request('POST', '/v1/owner/organizations', {
      name: 'Atelier Atlas',
      requestId: randomUUID(),
    })
    expect(r.statusCode, r.body).toBe(201)
    return r.json<OwnerOnboarding>()
  }
  const activate = async (draft: OwnerOnboarding) => {
    draft.configuration.company = {
      legalName: 'Atelier Atlas SARL',
      address: 'Rue Atlas',
      city: 'Casablanca',
      phone: '0600000000 0500000000',
    }
    draft.configuration.defaults = {
      ...draft.configuration.defaults,
      layout: 'atelier',
      compact: true,
      paymentDueDays: 30,
      estimateValidDays: 21,
      vatEnabled: false,
    }
    const saved = await request(
      'PUT',
      `/v1/owner/organizations/${draft.organization.id}/onboarding`,
      { configuration: draft.configuration, currentStep: 6, expectedVersion: draft.version },
    )
    expect(saved.statusCode, saved.body).toBe(200)
    const complete = await request(
      'POST',
      `/v1/owner/organizations/${draft.organization.id}/onboarding/complete`,
      { expectedVersion: saved.json().version },
    )
    expect(complete.statusCode, complete.body).toBe(200)
    return complete.json<OwnerOnboarding>()
  }

  const enter = async (id: string) => {
    const deliveries: Parameters<OrganizationAdminDelivery['send']>[0][] = []
    const identity = createIdentityModule({
      database: () => tenantDatabase(fixture.db, id),
      ttlDays: 14,
      secure: false,
      portalOrigin: origin,
      adminDelivery: {
        send: async (input) => {
          deliveries.push(input)
        },
      },
    })
    await identity.provisioning.runOne()
    expect(deliveries).toHaveLength(1)
    const login = await app.inject({
      method: 'POST',
      url: `/v1/organizations/${id}/auth/login`,
      headers: { origin },
      payload: { email: 'owner@company.test', password: deliveries[0]!.temporaryPassword },
    })
    expect(login.statusCode, login.body).toBe(200)
    expect(login.json().purpose).toBe('password_change')
    const restricted = login.cookies.find((c) => c.name === 'slama_staff_session')!.value
    const change = await app.inject({
      method: 'POST',
      url: `/v1/organizations/${id}/auth/change-password`,
      headers: { origin },
      cookies: { slama_staff_session: restricted },
      payload: {
        currentPassword: deliveries[0]!.temporaryPassword,
        newPassword: 'Independent-2026-Password!',
      },
    })
    expect(change.statusCode, change.body).toBe(200)
    return {
      token: change.cookies.find((c) => c.name === 'slama_staff_session')!.value,
      initial: deliveries[0]!,
    }
  }
  const staff = (
    method: 'GET' | 'POST',
    url: string,
    id: string,
    staffToken: string,
    payload?: object,
  ) =>
    app.inject({
      method,
      url,
      payload,
      headers: { origin, 'x-organization-id': id },
      cookies: { slama_staff_session: staffToken },
    })
  it('creates exactly one independent administrator during idempotent organization creation and starts one seven-day trial', async () => {
    const draft = await create()
    expect(draft.organization.staffCount).toBe(1)
    const [admin] =
      await fixture.client`select u.* from users u join user_roles ur on ur.user_id=u.id join roles r on r.id=ur.role_id where u.organization_id=${draft.organization.id} and r.key='admin'`
    expect(admin!.email).toBe('owner@company.test')
    expect(admin!.id).not.toBe(ownerId)
    expect(admin!.must_change_password).toBe(true)
    expect(admin!.temporary_password_expires_at).toBeNull()
    const retry = await request('POST', '/v1/owner/organizations', {
      name: 'Retry',
      requestId: draft.organization.id,
    })
    expect(retry.statusCode, retry.body).toBe(201)
    expect(
      await fixture.client`select id from users where organization_id=${draft.organization.id}`,
    ).toHaveLength(1)
    expect(
      (
        await request('POST', '/v1/owner/organizations', { name: 'Extra', requestId: randomUUID() })
      ).json().code,
    ).toBe('ORGANIZATION_LIMIT')
    const [subscription] =
      await fixture.client`select extract(epoch from trial_ends_at-trial_started_at)::int seconds from owner_subscriptions where owner_id=${ownerId}`
    expect(subscription!.seconds).toBe(7 * 86400)
  })
  it('activates settings, delivers one-use independent credentials and forbids platform-session organization access', async () => {
    const done = await activate(await create()),
      id = done.organization.id
    expect(done.organization.status).toBe('active')
    const [defaults] =
      await fixture.client`select c.*,t.layout,t.density from company_settings c join document_templates t on t.id=c.default_template_id where c.organization_id=${id}`
    expect(defaults).toMatchObject({
      payment_due_days: 30,
      estimate_valid_days: 21,
      layout: 'atelier',
      density: 'compact',
    })
    expect((await request('GET', '/v1/workspace/session', undefined, id)).statusCode).toBe(401)
    expect(
      (await request('POST', '/v1/clients', { type: 'company', legalName: 'Forbidden' }, id))
        .statusCode,
    ).toBe(403)
    const admin = await enter(id)
    const workspace = await staff('GET', '/v1/workspace/session', id, admin.token)
    expect(workspace.statusCode, workspace.body).toBe(200)
    expect(workspace.json().identityType).toBe('staff')
    expect(Object.keys(workspace.json().subscription)).toEqual(['entitlements'])
    const client = await staff('POST', '/v1/clients', id, admin.token, {
      type: 'company',
      legalName: 'Moroccan client',
    })
    expect(client.statusCode, client.body).toBe(201)
    const replay = await app.inject({
      method: 'POST',
      url: `/v1/organizations/${id}/auth/login`,
      headers: { origin },
      payload: { email: admin.initial.to, password: admin.initial.temporaryPassword },
    })
    expect(replay.statusCode).toBe(401)
    expect(
      await fixture.client`select status from organization_admin_deliveries where organization_id=${id}`,
    ).toEqual([{ status: 'sent' }])
    const [user] = await fixture.client`select id from users where organization_id=${id}`
    expect(
      await fixture.client`select id from audit_events where organization_id=${id} and actor_id=${user!.id}`,
    ).not.toHaveLength(0)
    const repeat = await request('POST', `/v1/owner/organizations/${id}/onboarding/complete`, {
      expectedVersion: done.version,
    })
    expect(repeat.statusCode, repeat.body).toBe(200)
    expect(
      await fixture.client`select id from document_templates where organization_id=${id}`,
    ).toHaveLength(1)
  })
  it('counts the initial administrator and serializes the remaining trial staff slot', async () => {
    const done = await activate(await create()),
      id = done.organization.id,
      admin = await enter(id)
    const results = await Promise.all(
      [1, 2].map((n) =>
        staff('POST', '/v1/staff', id, admin.token, {
          email: `staff${n}@company.test`,
          firstName: 'Staff',
          lastName: 'User',
          roleIds: [],
        }),
      ),
    )
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409])
    expect(results.find((r) => r.statusCode === 409)!.json().code).toBe('STAFF_LIMIT')
    await fixture.client`update owner_subscriptions set plan_code='essential',paid_through_at=now()+interval '30 days' where owner_id=${ownerId}`
    expect(
      (
        await staff('POST', '/v1/staff', id, admin.token, {
          email: 'third@company.test',
          firstName: 'Staff',
          lastName: 'User',
          roleIds: [],
        })
      ).json().code,
    ).toBe('STAFF_LIMIT')
    const me = (await staff('GET', '/v1/workspace/session', id, admin.token)).json()
    expect(me.subscription.entitlements.staffPerOrganization).toBe(1)
  })
  it('allows ownership-scoped read-only platform analytics but never staff impersonation or foreign organization reads', async () => {
    const done = await activate(await create()),
      id = done.organization.id,
      admin = await enter(id)
    const customer = await staff('POST', '/v1/clients', id, admin.token, {
      type: 'company',
      legalName: 'Reporting client',
    })
    const invoice = await staff('POST', '/v1/invoices', id, admin.token, {
      clientId: customer.json().id,
      templateId: null,
      issueDate: '2026-10-01',
      dueDate: '2026-10-10',
      notes: null,
      paymentTerms: null,
      lines: [
        {
          productVariantId: null,
          productName: 'Wheat',
          quantity: 2,
          unitPrice: '100.00',
          vatRate: null,
        },
      ],
    })
    expect(invoice.statusCode, invoice.body).toBe(201)
    const issued = await staff('POST', `/v1/invoices/${invoice.json().id}/issue`, id, admin.token, {
      expectedVersion: invoice.json().version,
    })
    expect(issued.statusCode, issued.body).toBe(200)
    const result = await request(
      'GET',
      `/v1/owner/analytics/financial-summary?start=2026-10-01&end=2026-10-31`,
    )
    expect(result.statusCode, result.body).toBe(200)
    expect(result.json()).toMatchObject({
      currency: 'MAD',
      totals: { revenue: '200.00', collected: '0.00', outstanding: '200.00', overdue: '200.00' },
      organizations: [{ id }],
    })
    expect(result.json().series).toHaveLength(31)
    expect(
      (
        await request(
          'GET',
          `/v1/owner/analytics/financial-summary?start=2026-10-01&end=2026-10-31&organizationId=${randomUUID()}`,
        )
      ).statusCode,
    ).toBe(404)
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/v1/owner-auth/session',
          cookies: { slama_staff_session: admin.token },
          headers: { origin },
        })
      ).statusCode,
    ).toBe(401)
    await fixture.client`update organizations set paused_at=now() where id=${id}`
    expect((await staff('GET', '/v1/workspace/session', id, admin.token)).statusCode).toBe(403)
    expect((await request('GET', `/v1/owner/organizations/${id}`)).statusCode).toBe(200)
  })
  it('retries administrator delivery without persisting cleartext credentials and claims a job only once', async () => {
    const done = await activate(await create()),
      id = done.organization.id
    let fail = true
    const deliveries: Parameters<OrganizationAdminDelivery['send']>[0][] = []
    const identity = createIdentityModule({
      database: () => tenantDatabase(fixture.db, id),
      ttlDays: 14,
      secure: false,
      portalOrigin: origin,
      adminDelivery: {
        send: async (input) => {
          if (fail) throw Error('provider unavailable')
          deliveries.push(input)
        },
      },
    })
    await identity.provisioning.runOne()
    expect(
      await fixture.client`select status,attempts from organization_admin_deliveries where organization_id=${id}`,
    ).toEqual([{ status: 'pending', attempts: 1 }])
    await fixture.client`update organization_admin_deliveries set available_at=now() where organization_id=${id}`
    fail = false
    await Promise.all([identity.provisioning.runOne(), identity.provisioning.runOne()])
    expect(deliveries).toHaveLength(1)
    const [job] =
      await fixture.client`select * from organization_admin_deliveries where organization_id=${id}`
    expect(JSON.stringify(job)).not.toContain(deliveries[0]!.temporaryPassword)
    const [account] =
      await fixture.client`select password_hash from users where organization_id=${id}`
    expect(account!.password_hash).not.toBe(deliveries[0]!.temporaryPassword)
    expect(job!.status).toBe('sent')
    await identity.provisioning.runOne()
    expect(deliveries).toHaveLength(1)
  })
})
