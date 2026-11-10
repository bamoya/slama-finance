import { randomBytes } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/env.js'
import { createPasswordService } from '../src/lib/password.js'
import { tenantDatabase } from '../src/lib/tenant-database.js'
import { createTenantWorkerRunner } from '../src/lib/tenant-workers.js'
import { base32Decode, totp } from '../src/lib/totp.js'
import { companyDate } from '../src/lib/validation.js'
import { createAdminAccounts } from '../src/modules/platform/administration/index.js'
import {
  createSubscriptionsModule,
  zonedDayStart,
} from '../src/modules/platform/subscriptions/index.js'
import {
  attachTestDatabase,
  isolatedDatabase,
  testOrganizationId,
  testOwnerId,
} from './helpers/postgres.js'

const origin = 'http://localhost:5173'
const headers = { origin }
const adminPassword = 'admin-password-2026'
const ownerPassword = 'owner-password-2026'
const secret = 'INTERNAL-OVERRIDE-NOTE-41c2'
const otherOwner = '20000000-0000-4000-8000-000000000002'
const otherOrganization = '20000000-0000-4000-8000-000000000001'
const HOUR = 3_600_000
const DAY = 24 * HOUR
/** Calendar day in the customer zone, offset by whole days from now. */
const day = (offset = 0) => companyDate(new Date(Date.now() + offset * DAY))

describe('Owner-subscription overrides', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let app: Awaited<ReturnType<typeof buildApp>>
  let cookie: string
  let key: Buffer
  let subscriptions: ReturnType<typeof createSubscriptionsModule>['publicApi']

  beforeEach(async () => {
    fixture = await isolatedDatabase()
    app = await buildApp({
      environment: loadEnvironment({
        NODE_ENV: 'test',
        OWNER_AUTH_ENABLED: 'true',
        ADMIN_TOTP_KEY: randomBytes(32).toString('base64'),
      }),
      logger: false,
    })
    attachTestDatabase(app, fixture)
    subscriptions = createSubscriptionsModule(() => fixture.db).publicApi
    await createAdminAccounts(() => fixture.db).create({
      email: 'ops@example.test',
      name: 'Ops',
      password: adminPassword,
    })
    const passwords = createPasswordService()
    await fixture.client`update platform_users set password_hash=${await passwords.hash(ownerPassword)},email_verified_at=now() where id=${testOwnerId}`
    // Essential: one organization, one member, no business emails or features.
    await fixture.client`update owner_subscriptions set plan_code='essential' where owner_id=${testOwnerId}`
    await fixture.client`insert into platform_users (id,email,password_hash) values (${otherOwner},'other-owner@example.test','x')`
    await fixture.client`insert into organizations(id,owner_id,name,slug,activated_at) values (${otherOrganization},${otherOwner},'Other','other',now())`
    await fixture.client`update owner_subscriptions set plan_code='essential',paid_through_at=now()+interval '30 days' where owner_id=${otherOwner}`
    const pending = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      headers,
      payload: { email: 'ops@example.test', password: adminPassword },
    })
    key = base32Decode(pending.json().enrollment.secret)
    const done = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/2fa',
      headers,
      cookies: {
        slama_admin_session: pending.cookies.find((c) => c.name === 'slama_admin_session')!.value,
      },
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
  const base = (owner = testOwnerId) => `/api/v1/admin/owners/${owner}/entitlement-overrides`
  const create = async (body: object, owner = testOwnerId) =>
    admin(base(owner), {
      booleanValue: null,
      integerValue: null,
      unlimited: false,
      reason: secret,
      ...body,
    })
  const revoke = async (id: string, owner = testOwnerId) =>
    admin(`${base(owner)}/${id}/revoke`, { reason: 'Ended early' })
  async function ownerCookie() {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/owner-auth/login',
      headers,
      payload: { email: 'fixture-owner@example.test', password: ownerPassword },
    })
    expect(response.statusCode).toBe(200)
    return response.cookies.find((c) => c.name === 'slama_owner_session')!.value
  }
  const admitStaff = () =>
    tenantDatabase(fixture.db, testOrganizationId).transaction((tx) => subscriptions.admitStaff(tx))
  const hasEmails = (organizationId = testOrganizationId) =>
    tenantDatabase(fixture.db, organizationId).transaction((tx) =>
      subscriptions.hasFeature(tx, 'business_emails'),
    )

  it('requires the admin session and a reason, takes no second factor, and audits atomically', async () => {
    const bad = await create({
      entitlementKey: 'business_emails',
      booleanValue: true,
      code: '000000',
    })
    expect(bad.statusCode).toBe(400)
    const anonymous = await app.inject({
      method: 'POST',
      url: base(),
      headers,
      payload: {
        entitlementKey: 'business_emails',
        booleanValue: true,
        integerValue: null,
        unlimited: false,
        reason: secret,
      },
    })
    expect(anonymous.statusCode).toBe(401)
    const noReason = await create({
      entitlementKey: 'business_emails',
      booleanValue: true,
      reason: '',
    })
    expect(noReason.statusCode).toBe(400)
    const blank = await create({
      entitlementKey: 'business_emails',
      booleanValue: true,
      reason: '   ',
    })
    expect(blank.statusCode).toBe(400)
    expect(blank.json().code).toBe('VALIDATION_ERROR')
    expect(await fixture.client`select 1 from subscription_overrides`).toHaveLength(0)

    const ok = await create({ entitlementKey: 'business_emails', booleanValue: true })
    expect(ok.statusCode).toBe(201)
    expect(ok.json()).toMatchObject({
      state: 'active',
      createdBy: 'ops@example.test',
      reason: secret,
    })
    const audits =
      await fixture.client`select * from platform_admin_audit where action='subscription_override.create'`
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({ target_type: 'owner', target_id: testOwnerId })
    expect(audits[0]!.after).toMatchObject({ entitlementKey: 'business_emails', reason: secret })

    // A failed write (overlap) rolls back with no audit row.
    const overlap = await create({ entitlementKey: 'business_emails', booleanValue: false })
    expect(overlap.statusCode).toBe(409)
    expect(overlap.json().code).toBe('OVERRIDE_OVERLAP')
    expect(
      await fixture.client`select 1 from platform_admin_audit where action='subscription_override.create'`,
    ).toHaveLength(1)
  })

  it('is not reachable by owners or staff, and owner reads expose only values and sources', async () => {
    const owner = await ownerCookie()
    for (const [method, url] of [
      ['GET', base()],
      ['POST', base()],
    ] as const) {
      const response = await app.inject({
        method,
        url,
        headers,
        cookies: { slama_owner_session: owner },
        payload: method === 'POST' ? {} : undefined,
      })
      expect([401, 403, 404]).toContain(response.statusCode)
    }
    expect(
      (await create({ entitlementKey: 'business_emails', booleanValue: true })).statusCode,
    ).toBe(201)
    const summary = await app.inject({
      method: 'GET',
      url: '/api/v1/owner/subscription',
      headers,
      cookies: { slama_owner_session: owner },
    })
    expect(summary.statusCode).toBe(200)
    expect(summary.body).not.toContain(secret)
    expect(summary.body).not.toContain('ops@example.test')
    expect(summary.json().entitlements.features).toContain('business_emails')
    expect(
      summary
        .json()
        .entitlementSources.find(
          (s: { entitlementKey: string }) => s.entitlementKey === 'business_emails',
        ),
    ).toEqual({ entitlementKey: 'business_emails', source: 'override', effectiveUntil: null })
  })

  it('isolates one customer exception from every other owner', async () => {
    const created = await create({ entitlementKey: 'staffPerOrganization', integerValue: 4 })
    expect(created.statusCode).toBe(201)
    expect((await subscriptions.summary(testOwnerId)).entitlements.staffPerOrganization).toBe(4)
    expect((await subscriptions.summary(otherOwner)).entitlements.staffPerOrganization).toBe(1)
    // Cross-owner mutation and listing through another owner's path are refused.
    expect((await revoke(created.json().id, otherOwner)).statusCode).toBe(404)
    expect((await admin(base(otherOwner), {}, 'GET')).json().items).toEqual([])
    expect(await hasEmails(otherOrganization)).toBe(false)
    // Database policy: an owner or another owner's organization cannot read the record.
    const visible = (settings: string) =>
      fixture.db.transaction(async (tx) => {
        await tx.execute(
          sql.raw(`grant select on subscription_overrides, organizations to "${fixture.role}"`),
        )
        await tx.execute(sql.raw(`set local role "${fixture.role}"`))
        // The fixture connection defaults to its own organization; clear it first.
        await tx.execute(sql`select set_config('app.organization_id','',true)`)
        await tx.execute(sql.raw(settings))
        return (await tx.execute(sql`select id from subscription_overrides`)).length
      })
    expect(
      await visible(
        `select set_config('app.actor_type','owner',true),set_config('app.owner_id','${otherOwner}',true)`,
      ),
    ).toBe(0)
    expect(
      await visible(`select set_config('app.organization_id','${otherOrganization}',true)`),
    ).toBe(0)
    expect(
      await visible(
        `select set_config('app.actor_type','owner',true),set_config('app.owner_id','${testOwnerId}',true)`,
      ),
    ).toBe(1)
    // Notes (reason, authors, revocation reason) are administrator-only, even for the owner itself,
    // its own organization or workers: tenant scopes see values, never notes.
    const notes = (settings: string) =>
      fixture.db.transaction(async (tx) => {
        await tx.execute(
          sql.raw(
            `grant select on subscription_override_notes, organizations to "${fixture.role}"`,
          ),
        )
        await tx.execute(sql.raw(`set local role "${fixture.role}"`))
        await tx.execute(sql`select set_config('app.organization_id','',true)`)
        await tx.execute(sql.raw(settings))
        return (await tx.execute(sql`select reason from subscription_override_notes`)).length
      })
    for (const settings of [
      `select set_config('app.actor_type','owner',true),set_config('app.owner_id','${testOwnerId}',true)`,
      `select set_config('app.organization_id','${testOrganizationId}',true)`,
      `select set_config('app.actor_type','worker',true)`,
    ])
      expect(await notes(settings)).toBe(0)
    expect(await notes(`select set_config('app.actor_type','platform_admin',true)`)).toBe(1)
  })

  it('validates typed values, unlimited permission, DTO minima and start time', async () => {
    const cases: [object, string][] = [
      [{ entitlementKey: 'storageBytes', unlimited: true }, 'OVERRIDE_VALUE_INVALID'],
      [{ entitlementKey: 'businessEmails', unlimited: true }, 'OVERRIDE_VALUE_INVALID'],
      [{ entitlementKey: 'organizations', integerValue: 0 }, 'OVERRIDE_VALUE_INVALID'],
      [{ entitlementKey: 'staffPerOrganization', booleanValue: true }, 'OVERRIDE_VALUE_INVALID'],
      [{ entitlementKey: 'custom_domains', integerValue: 1 }, 'OVERRIDE_VALUE_INVALID'],
      [
        {
          entitlementKey: 'custom_domains',
          booleanValue: true,
          startsOn: day(-1),
        },
        'OVERRIDE_START_IN_PAST',
      ],
      [
        {
          entitlementKey: 'custom_domains',
          booleanValue: true,
          startsOn: day(2),
          endsOn: day(1),
        },
        'OVERRIDE_VALUE_INVALID',
      ],
    ]
    for (const [body, code] of cases) {
      const response = await create(body)
      expect(response.statusCode, JSON.stringify(body)).toBe(400)
      expect(response.json().code).toBe(code)
    }
    const negative = await create({ entitlementKey: 'storageBytes', integerValue: -1 })
    expect(negative.statusCode).toBe(400)
    const unlimited = await create({ entitlementKey: 'organizations', unlimited: true })
    expect(unlimited.statusCode).toBe(201)
    expect((await subscriptions.summary(testOwnerId)).entitlements.organizations).toBeNull()
    // The database rejects forbidden unlimited values even without the service.
    await expect(
      fixture.client`insert into subscription_overrides(owner_id,entitlement_key,value_type,is_unlimited,starts_at) values (${testOwnerId},'storageBytes','integer',true,now())`,
    ).rejects.toThrow(/unlimited/)
  })

  it('rejects overlapping windows, allows adjacent ones and serializes concurrent writes', async () => {
    const at = (offset: number) => day(offset + 1)
    const first = await create({
      entitlementKey: 'businessEmails',
      integerValue: 100,
      startsOn: at(0),
      endsOn: at(2),
    })
    expect(first.statusCode).toBe(201)
    expect(first.json().state).toBe('scheduled')
    const overlapping = await create({
      entitlementKey: 'businessEmails',
      integerValue: 50,
      startsOn: at(1),
      endsOn: null,
    })
    expect(overlapping.json().code).toBe('OVERRIDE_OVERLAP')
    const adjacent = await create({
      entitlementKey: 'businessEmails',
      integerValue: 50,
      startsOn: at(2),
      endsOn: at(3),
    })
    expect(adjacent.statusCode).toBe(201)
    const otherKey = await create({
      entitlementKey: 'storageBytes',
      integerValue: 5,
      startsOn: at(1),
    })
    expect(otherKey.statusCode).toBe(201)

    // Two independent transactions writing overlapping open-ended windows: exactly one commits.
    const insert = () =>
      fixture.client.begin(async (tx) => {
        const [row] =
          await tx`insert into subscription_overrides(owner_id,entitlement_key,value_type,boolean_value,starts_at) values (${testOwnerId},'report_exports','boolean',true,now()) returning id`
        await tx`insert into subscription_override_notes(override_id,reason,created_by) select ${row!.id},'race',id from platform_admins`
        await tx`select pg_sleep(0.2)`
      })
    const results = await Promise.allSettled([insert(), insert(), insert()])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(
      await fixture.client`select 1 from subscription_overrides where entitlement_key='report_exports'`,
    ).toHaveLength(1)
  })

  it('revokes and amends without losing history, and the record stays append-only', async () => {
    const created = await create({ entitlementKey: 'staffPerOrganization', integerValue: 3 })
    const id = created.json().id
    const amended = await create({
      entitlementKey: 'staffPerOrganization',
      integerValue: 6,
      replacesId: id,
    })
    expect(amended.statusCode).toBe(201)
    expect(amended.json().replacesId).toBe(id)
    expect((await subscriptions.summary(testOwnerId)).entitlements.staffPerOrganization).toBe(6)
    const revoked = await revoke(amended.json().id)
    expect(revoked.statusCode).toBe(200)
    expect(revoked.json()).toMatchObject({ state: 'revoked', revokedBy: 'ops@example.test' })
    expect((await revoke(amended.json().id)).json().code).toBe('OVERRIDE_NOT_REVOCABLE')
    const blankRevoke = await admin(`${base()}/${created.json().id}/revoke`, {
      reason: ' \t ',
    })
    expect(blankRevoke.statusCode).toBe(400)
    expect((await subscriptions.summary(testOwnerId)).entitlements.staffPerOrganization).toBe(1)
    const history = (await admin(base(), {}, 'GET')).json().items
    expect(history.map((o: { state: string }) => o.state)).toEqual(['revoked', 'revoked'])
    expect(
      (
        await fixture.client`select action from platform_admin_audit where action like 'subscription_override.%' order by created_at, action`
      ).map((r) => r.action),
    ).toEqual(
      expect.arrayContaining(['subscription_override.create', 'subscription_override.revoke']),
    )
    await expect(
      fixture.client`update subscription_overrides set integer_value=99 where id=${id}`,
    ).rejects.toThrow()
    await expect(
      fixture.client`delete from subscription_overrides where id=${id}`,
    ).rejects.toThrow()
    await expect(
      fixture.client`update subscription_overrides set revoked_at=null where id=${id}`,
    ).rejects.toThrow()
    await expect(
      fixture.client`update subscription_override_notes set reason='rewritten' where override_id=${id}`,
    ).rejects.toThrow()
  })

  it('enforces values in API admissions and worker selection while preserving usage', async () => {
    // Fixture organization already has its initial member: Essential allows one.
    await expect(admitStaff()).rejects.toMatchObject({ code: 'STAFF_LIMIT' })
    const staff = await create({ entitlementKey: 'staffPerOrganization', integerValue: 3 })
    await admitStaff()
    await revoke(staff.json().id)
    await expect(admitStaff()).rejects.toMatchObject({ code: 'STAFF_LIMIT' })

    const visited = async () => {
      const seen: string[] = []
      await createTenantWorkerRunner(
        () => fixture.db,
        (feature) =>
          tenantDatabase(fixture.db).transaction((tx) => subscriptions.workerEligible(tx, feature)),
      )(async (id) => void seen.push(id), false, 'business_emails')
      return seen
    }
    expect(await hasEmails()).toBe(false)
    expect(await visited()).toEqual([])
    await create({ entitlementKey: 'business_emails', booleanValue: true })
    await create({ entitlementKey: 'businessEmails', integerValue: 10 })
    expect(await hasEmails()).toBe(true)
    expect(await visited()).toEqual([testOrganizationId])

    const reserve = (messageKey: string, recipients: number) =>
      tenantDatabase(fixture.db, testOrganizationId).transaction((tx) =>
        subscriptions.reserveEmail(tx, messageKey, recipients),
      )
    await reserve('message-1', 8)
    // Lowering the allowance keeps queued usage and blocks only new over-limit sends.
    const [current] = (await admin(base(), {}, 'GET'))
      .json()
      .items.filter((o: { entitlementKey: string }) => o.entitlementKey === 'businessEmails')
    await create({ entitlementKey: 'businessEmails', integerValue: 5, replacesId: current.id })
    const summary = await subscriptions.summary(testOwnerId)
    expect(summary.usage.businessEmails).toBe(8)
    expect(summary.entitlements.businessEmails).toBe(5)
    await expect(reserve('message-2', 1)).rejects.toMatchObject({ code: 'EMAIL_LIMIT' })
    expect(await fixture.client`select 1 from subscription_emails`).toHaveLength(1)

    // Restrictions always win over a granted feature.
    await fixture.client`update organizations set suspended_at=now() where id=${testOrganizationId}`
    expect(await hasEmails()).toBe(false)
    expect(await visited()).toEqual([])
  })

  it('guards isolation level, server-authored times and amendment gaps in the database', async () => {
    const insertAt = (startsAt: string, isolation = 'read committed') =>
      fixture.client.begin(async (tx) => {
        await tx.unsafe(`set transaction isolation level ${isolation}`)
        const [row] =
          await tx`insert into subscription_overrides(owner_id,entitlement_key,value_type,boolean_value,starts_at) values (${testOwnerId},'staff_roles','boolean',true,${startsAt}::timestamptz) returning id`
        await tx`insert into subscription_override_notes(override_id,reason,created_by) select ${row!.id},'db',id from platform_admins`
        return row!.id as string
      })
    await expect(insertAt('now', 'repeatable read')).rejects.toThrow(/READ COMMITTED/)
    await expect(insertAt('now', 'serializable')).rejects.toThrow(/READ COMMITTED/)
    await expect(insertAt(new Date(Date.now() - HOUR).toISOString())).rejects.toThrow(/start now/)
    // A note is mandatory for every committed override.
    await expect(
      fixture.client`insert into subscription_overrides(owner_id,entitlement_key,value_type,boolean_value,starts_at) values (${testOwnerId},'staff_roles','boolean',true,now())`,
    ).rejects.toThrow(/administrator note/)
    const id = await insertAt('now')
    const revokeAt = (at: string) =>
      fixture.client.begin(async (tx) => {
        await tx`update subscription_overrides set revoked_at=${at}::timestamptz where id=${id}`
        await tx`update subscription_override_notes set revoked_by=created_by,revocation_reason='r' where override_id=${id}`
      })
    await expect(revokeAt(new Date(Date.now() - HOUR).toISOString())).rejects.toThrow(
      /current time/,
    )
    await expect(revokeAt(new Date(Date.now() + HOUR).toISOString())).rejects.toThrow(
      /current time/,
    )
    // A revocation note cannot precede the revocation (it would make the override unrevokable),
    // and a revocation cannot commit without its note.
    await expect(
      fixture.client`update subscription_override_notes set revoked_by=created_by,revocation_reason='r' where override_id=${id}`,
    ).rejects.toThrow(/Revoke the override before/)
    await expect(
      fixture.client`update subscription_overrides set revoked_at=now() where id=${id}`,
    ).rejects.toThrow(/administrator note/)
    await revokeAt('now') // database time
    // replaces_id must name a revoked override of the same owner and entitlement.
    const amend = (replaces: string, key = 'staff_roles') =>
      fixture.client.begin(async (tx) => {
        const [row] =
          await tx`insert into subscription_overrides(owner_id,entitlement_key,value_type,boolean_value,starts_at,replaces_id) values (${testOwnerId},${key},'boolean',true,now(),${replaces}) returning id`
        await tx`insert into subscription_override_notes(override_id,reason,created_by) select ${row!.id},'db',id from platform_admins`
      })
    const unrevoked = await insertAt('now')
    await expect(amend(id, 'report_exports')).rejects.toThrow(/same owner and entitlement/)
    await fixture.client.begin(async (tx) => {
      // Another owner's revoked record cannot be referenced either.
      const [row] =
        await tx`insert into subscription_overrides(owner_id,entitlement_key,value_type,boolean_value,starts_at) values (${otherOwner},'staff_roles','boolean',true,now()) returning id`
      await tx`insert into subscription_override_notes(override_id,reason,created_by) select ${row!.id},'db',id from platform_admins`
    })
    await expect(amend(unrevoked)).rejects.toThrow(/same owner and entitlement/)
    const [foreign] =
      await fixture.client`select id from subscription_overrides where owner_id=${otherOwner} and entitlement_key='staff_roles'`
    await expect(
      fixture.client.begin(async (tx) => {
        await tx`update subscription_overrides set revoked_at=now() where id=${foreign!.id}`
        await tx`update subscription_override_notes set revoked_by=created_by,revocation_reason='r' where override_id=${foreign!.id}`
        await tx`insert into subscription_overrides(owner_id,entitlement_key,value_type,boolean_value,starts_at,replaces_id) values (${testOwnerId},'staff_roles','boolean',true,now(),${foreign!.id})`
      }),
    ).rejects.toThrow(/same owner and entitlement/)

    // Amending an applied override with a later start would leave the plan value in between.
    const active = await create({ entitlementKey: 'staffPerOrganization', integerValue: 3 })
    const later = await create({
      entitlementKey: 'staffPerOrganization',
      integerValue: 4,
      replacesId: active.json().id,
      startsOn: day(2),
    })
    expect(later.statusCode).toBe(409)
    expect(later.json().code).toBe('OVERRIDE_AMENDMENT_START')
    expect((await subscriptions.summary(testOwnerId)).entitlements.staffPerOrganization).toBe(3)
  })

  it('interprets calendar days in the customer timezone and stores UTC instants', async () => {
    const midnight = (d: string) => zonedDayStart(d)
    // Today in the zone (or no day) starts now; the response names the zone used.
    const today = await create({
      entitlementKey: 'custom_domains',
      booleanValue: true,
      startsOn: day(),
    })
    expect(today.statusCode).toBe(201)
    expect(today.json()).toMatchObject({ state: 'active', timezone: 'Africa/Casablanca' })
    expect(Math.abs(Date.parse(today.json().startsAt) - Date.now())).toBeLessThan(60_000)
    // A later day starts at its midnight in the zone; the end day is exclusive (its midnight).
    const later = await create({
      entitlementKey: 'report_exports',
      booleanValue: true,
      startsOn: day(3),
      endsOn: day(5),
    })
    expect(later.statusCode).toBe(201)
    expect(later.json().startsAt).toBe(midnight(day(3)).toISOString())
    expect(later.json().endsAt).toBe(midnight(day(5)).toISOString())
    expect(later.json().state).toBe('scheduled')
    // Invalid ranges.
    for (const body of [
      { startsOn: day(2), endsOn: day(2) },
      { startsOn: day(3), endsOn: day(2) },
      { endsOn: day() }, // today's midnight is already past
    ]) {
      const response = await create({ entitlementKey: 'staff_roles', booleanValue: true, ...body })
      expect(response.statusCode, JSON.stringify(body)).toBe(400)
      expect(response.json().code).toBe('OVERRIDE_VALUE_INVALID')
    }
    for (const bad of [
      { startsOn: '2026-02-30' },
      { endsOn: '2027-02-30' },
      { startsOn: 'not-a-day' },
    ]) {
      const response = await create({ entitlementKey: 'staff_roles', booleanValue: true, ...bad })
      expect(response.statusCode, JSON.stringify(bad)).toBe(400)
      expect(response.json().code).toBe('VALIDATION_ERROR')
    }
    expect(
      (
        await create({ entitlementKey: 'staff_roles', booleanValue: true, startsOn: day(-1) })
      ).json().code,
    ).toBe('OVERRIDE_START_IN_PAST')

    // 23:30Z on 8 November 2025 was already 9 November in Casablanca (UTC+1). Pinned to settled
    // history: tzdata 2026e moved Morocco to UTC+0 from 20 September 2026, so later dates follow
    // whatever zone data the runtime ships.
    expect(companyDate(new Date('2025-11-08T23:30:00Z'))).toBe('2025-11-09')
    expect(midnight('2025-11-09').toISOString()).toBe('2025-11-08T23:00:00.000Z')
    // DST-adjacent days: around every 2026 offset change, the returned instant is the first one
    // of that local day (the previous millisecond belongs to the previous local day).
    const offsets = new Set<number>()
    for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += DAY) {
      const d = companyDate(new Date(t))
      offsets.add(Date.parse(`${d}T00:00:00Z`) - midnight(d).getTime())
    }
    expect(offsets.size, 'Casablanca changes offset in 2026').toBeGreaterThan(1)
    for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += DAY) {
      const d = companyDate(new Date(t))
      const start = midnight(d).getTime()
      expect(companyDate(new Date(start)), d).toBe(d)
      expect(companyDate(new Date(start - 1)), d).not.toBe(d)
    }
  })
})
