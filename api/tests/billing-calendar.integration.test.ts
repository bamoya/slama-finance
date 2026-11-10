import { randomBytes } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/env.js'
import { createPasswordService } from '../src/lib/password.js'
import { tenantDatabase } from '../src/lib/tenant-database.js'
import { base32Decode, totp } from '../src/lib/totp.js'
import { createAdminAccounts } from '../src/modules/platform/administration/index.js'
import { createSubscriptionsModule } from '../src/modules/platform/subscriptions/index.js'
import { createTimezoneRepository } from '../src/modules/platform/subscriptions/repositories/timezone.repository.js'
import {
  addCycle,
  billingMonth,
  billingMonthKey,
  zoneOffset,
} from '../src/modules/platform/subscriptions/services/billing-calendar.service.js'
import { databaseTimezoneCheck } from '../src/modules/platform/subscriptions/services/timezone-consistency.service.js'
import {
  attachTestDatabase,
  isolatedDatabase,
  testOrganizationId,
  testOwnerId,
} from './helpers/postgres.js'

const origin = 'http://localhost:5173'
const HOUR = 3_600_000

describe('billing calendar characterization against the previous SQL', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  beforeEach(async () => {
    fixture = await isolatedDatabase()
  })
  afterEach(async () => {
    await fixture?.cleanup()
  })

  // Exact expressions previously used by billing.repository addCycle and subscription.repository month(),
  // plus the database's own offset at the input and at each result (to detect tzdata disagreement).
  async function oldSql(instants: Date[], zone: string) {
    return fixture.client`
      with r as (
        select n, t,
          (((t at time zone ${zone}) + interval '1 month') at time zone ${zone}) as monthly,
          (((t at time zone ${zone}) + interval '12 months') at time zone ${zone}) as annual,
          (date_trunc('month', t at time zone ${zone}) at time zone ${zone}) as month_start,
          ((date_trunc('month', t at time zone ${zone}) + interval '1 month') at time zone ${zone}) as month_end
        from unnest(${instants.map((i) => i.toISOString())}::timestamptz[]) with ordinality x(t, n))
      select monthly, annual, month_start, month_end,
        array[t, monthly, annual, month_start, month_end]::text[] as points,
        array(select (extract(epoch from (p at time zone ${zone}) - (p at time zone 'UTC')) * 1000)::bigint
              from unnest(array[t, monthly, annual, month_start, month_end]) p)::text[] as offsets
      from r order by n`
  }
  const sample = () => {
    const out: Date[] = []
    for (let t = Date.UTC(2015, 0, 1, 0, 17); t < Date.UTC(2028, 0, 1); t += 37 * HOUR)
      out.push(new Date(t))
    // Month ends and late-evening local times are the edge cases of calendar arithmetic.
    for (let y = 2024; y <= 2027; y++)
      for (let m = 0; m < 12; m++)
        for (const h of [0, 21, 22, 23]) out.push(new Date(Date.UTC(y, m + 1, 0, h, 30)))
    // Targets landing in skipped or repeated local hours (DST and Ramadan changes), every 30 minutes.
    for (let y = 2024; y <= 2027; y++)
      for (const m of [1, 2, 3, 4, 8, 9])
        for (let d = 24; d <= 31; d++)
          for (let q = 0; q < 10; q++) out.push(new Date(Date.UTC(y, m, d, 0, 30 * q)))
    return out
  }

  for (const zone of ['Europe/Paris', 'America/Sao_Paulo', 'Africa/Casablanca'])
    it(`matches addCycle and billing months in ${zone} wherever both zone sources agree`, async () => {
      const instants = sample()
      const rows = await oldSql(instants, zone)
      let compared = 0,
        skipped = 0,
        comparedBefore2018 = 0
      instants.forEach((at, i) => {
        const row = rows[i]!
        const monthly = new Date(row.monthly as string)
        const annual = new Date(row.annual as string)
        const start = new Date(row.month_start as string)
        const end = new Date(row.month_end as string)
        // Compare only where the database and Node agree on the offset at the input and every result
        // (and one hour around them, for month boundaries next to a transition).
        const points = (row.points as string[]).map((p) => new Date(p))
        const offsets = (row.offsets as string[]).map(Number)
        const agree = points.every((d, k) => offsets[k] === zoneOffset(d, zone))
        if (!agree) {
          // The old SQL result must be exactly the same calendar rule applied with the database's own
          // offsets: the difference is the zone data, never the arithmetic.
          const wall = new Date(at.getTime() + offsets[0]!)
          const y = wall.getUTCFullYear(),
            m = wall.getUTCMonth(),
            d = wall.getUTCDate()
          const time = wall.getTime() % 86_400_000
          const shifted = (months: number) => {
            const days = new Date(Date.UTC(y, m + months + 1, 0)).getUTCDate()
            return Date.UTC(y, m + months, Math.min(d, days)) + time
          }
          expect(
            [
              shifted(1) - offsets[1]!,
              shifted(12) - offsets[2]!,
              Date.UTC(y, m, 1) - offsets[3]!,
              Date.UTC(y, m + 1, 1) - offsets[4]!,
            ],
            `${zone} ${at.toISOString()} rebuilt from database offsets`,
          ).toEqual([monthly, annual, start, end].map((x) => x.getTime()))
          skipped++
          return
        }
        const month = billingMonth(at, zone)
        const expected = [monthly, annual, start, end].map((d) => d.toISOString())
        const actual = [
          addCycle(at, 'monthly', zone),
          addCycle(at, 'annual', zone),
          month.start,
          month.end,
        ].map((d) => d.toISOString())
        expect(actual, `${zone} ${at.toISOString()}`).toEqual(expected)
        compared++
        if (at < new Date('2018-01-01T00:00:00Z')) comparedBefore2018++
      })
      // Skips are tzdata disagreements (test image vs Node), proven above to be data-only.
      if (zone !== 'Africa/Casablanca') expect(skipped).toBe(0)
      expect(compared).toBeGreaterThan(100)
      // Before 2018 both data sets agree for Casablanca, so those samples must all be compared.
      const early = instants.filter((at) => at < new Date('2018-01-01T00:00:00Z')).length
      expect(comparedBefore2018).toBe(early)
      expect(early).toBeGreaterThan(600)
    })

  it('runs the real startup comparison against the test database', async () => {
    const report = await databaseTimezoneCheck(createTimezoneRepository(() => fixture.db))()
    expect(['consistent', 'mismatch']).toContain(report.status)
    expect(report.zone).toBe('Africa/Casablanca')
    expect(report.mismatches > 0).toBe(report.status === 'mismatch')
  })
})

describe('timezone data mismatch at startup', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let app: Awaited<ReturnType<typeof buildApp>>
  beforeEach(async () => {
    fixture = await isolatedDatabase()
    app = await buildApp({
      environment: loadEnvironment({
        NODE_ENV: 'test',
        OWNER_AUTH_ENABLED: 'true',
        ADMIN_TOTP_KEY: randomBytes(32).toString('base64'),
      }),
      logger: false,
      readinessProbe: async () => {},
      timezoneCheck: async () => ({
        zone: 'Africa/Casablanca',
        status: 'mismatch',
        checkedAt: new Date().toISOString(),
        mismatches: 3,
        samples: [],
      }),
    })
    attachTestDatabase(app, fixture)
    await app.ready()
  })
  afterEach(async () => {
    await app?.close()
    await fixture?.cleanup()
  })

  it('reports degraded readiness, keeps reads and refuses only calendar-boundary writes', async () => {
    const ready = await app.inject('/ready')
    expect(ready.statusCode).toBe(200)
    expect(ready.json().timezoneData).toMatchObject({ status: 'mismatch', mismatches: 3 })

    await createAdminAccounts(() => fixture.db).create({
      email: 'ops@example.test',
      name: 'Ops',
      password: 'admin-password-2026',
    })
    const pending = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      headers: { origin },
      payload: { email: 'ops@example.test', password: 'admin-password-2026' },
    })
    const key = base32Decode(pending.json().enrollment.secret)
    const done = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/2fa',
      headers: { origin },
      cookies: {
        slama_admin_session: pending.cookies.find((c) => c.name === 'slama_admin_session')!.value,
      },
      payload: { code: totp(key, Date.now() - 30_000) },
    })
    const cookie = done.cookies.find((c) => c.name === 'slama_admin_session')!.value
    const admin = (url: string, payload: object = {}, method: 'GET' | 'POST' = 'POST') =>
      app.inject({
        method,
        url,
        headers: { origin },
        cookies: { slama_admin_session: cookie },
        payload,
      })
    const overrideUrl = `/api/v1/admin/owners/${testOwnerId}/entitlement-overrides`
    const body = {
      entitlementKey: 'custom_domains',
      booleanValue: true,
      integerValue: null,
      unlimited: false,
      reason: 'x',
    }
    // Calendar days need the zone data: refused.
    const dated = await admin(overrideUrl, { ...body, endsOn: '2099-01-01' })
    expect(dated.statusCode).toBe(503)
    expect(dated.json().code).toBe('TIMEZONE_DATA_MISMATCH')
    expect(await fixture.client`select 1 from subscription_overrides`).toHaveLength(0)
    // No calendar boundary computed: immediate open-ended override, its revocation and a
    // fixed-duration extension still work.
    const immediate = await admin(overrideUrl, { ...body })
    expect(immediate.statusCode).toBe(201)
    const revoked = await admin(`${overrideUrl}/${immediate.json().id}/revoke`, {
      reason: 'x',
    })
    expect(revoked.statusCode).toBe(200)
    const extension = await admin(`/api/v1/admin/owners/${testOwnerId}/subscription/extension`, {
      days: 3,
      reason: 'x',
    })
    expect(extension.statusCode).toBe(200)

    // Reads stay available.
    expect((await admin(`/api/v1/admin/owners/${testOwnerId}`, {}, 'GET')).statusCode).toBe(200)
    await fixture.client`update platform_users set password_hash=${await createPasswordService().hash('owner-password-2026')},email_verified_at=now() where id=${testOwnerId}`
    const owner = await app.inject({
      method: 'POST',
      url: '/api/v1/owner-auth/login',
      headers: { origin },
      payload: { email: 'fixture-owner@example.test', password: 'owner-password-2026' },
    })
    const ownerCookie = owner.cookies.find((c) => c.name === 'slama_owner_session')!.value
    const summary = await app.inject({
      method: 'GET',
      url: '/api/v1/owner/subscription',
      cookies: { slama_owner_session: ownerCookie },
    })
    expect(summary.statusCode).toBe(200)
    const submit = await app.inject({
      method: 'POST',
      url: '/api/v1/owner/subscription/payments',
      headers: { origin },
      cookies: { slama_owner_session: ownerCookie },
      payload: { planCode: 'business', cycle: 'monthly', method: 'cash', reference: 'R-1' },
    })
    expect(submit.statusCode).toBe(503)
    expect(submit.json().code).toBe('TIMEZONE_DATA_MISMATCH')
  })
})

describe('timezone data never verified', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let app: Awaited<ReturnType<typeof buildApp>>
  afterEach(async () => {
    await app?.close()
    await fixture?.cleanup()
  })

  it('stays ready for reads but refuses boundary writes with TIMEZONE_DATA_UNCHECKED', async () => {
    fixture = await isolatedDatabase()
    app = await buildApp({
      environment: loadEnvironment({ NODE_ENV: 'test', OWNER_AUTH_ENABLED: 'true' }),
      logger: false,
      readinessProbe: async () => {},
      timezoneCheck: async () => {
        throw new Error('database unavailable')
      },
    })
    attachTestDatabase(app, fixture)
    await app.ready()
    const ready = await app.inject('/ready')
    expect(ready.statusCode).toBe(200)
    expect(ready.json().timezoneData).toMatchObject({ status: 'unchecked', checkedAt: null })
    await fixture.client`update platform_users set password_hash=${await createPasswordService().hash('owner-password-2026')},email_verified_at=now() where id=${testOwnerId}`
    const owner = await app.inject({
      method: 'POST',
      url: '/api/v1/owner-auth/login',
      headers: { origin },
      payload: { email: 'fixture-owner@example.test', password: 'owner-password-2026' },
    })
    const cookie = owner.cookies.find((c) => c.name === 'slama_owner_session')!.value
    const submit = await app.inject({
      method: 'POST',
      url: '/api/v1/owner/subscription/payments',
      headers: { origin },
      cookies: { slama_owner_session: cookie },
      payload: { planCode: 'business', cycle: 'monthly', method: 'cash', reference: 'R-1' },
    })
    expect(submit.statusCode).toBe(503)
    expect(submit.json().code).toBe('TIMEZONE_DATA_UNCHECKED')
    const summary = await app.inject({
      method: 'GET',
      url: '/api/v1/owner/subscription',
      cookies: { slama_owner_session: cookie },
    })
    expect(summary.statusCode).toBe(200)
  })
})

describe('monthly email allowance key', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  beforeEach(async () => {
    fixture = await isolatedDatabase()
  })
  afterEach(async () => {
    await fixture?.cleanup()
  })

  it('uses the local calendar month, still counts old instant-keyed rows and never double counts', async () => {
    const subscriptions = createSubscriptionsModule(() => fixture.db).publicApi
    const month = billingMonthKey(new Date())
    const [y, m] = month.split('-').map(Number) as [number, number]
    // Old format: the month start instant as either data set would have produced it (UTC+1 or UTC+0).
    const plusOne = new Date(Date.UTC(y, m - 1, 1) - HOUR).toISOString()
    const utc = new Date(Date.UTC(y, m - 1, 1)).toISOString()
    const previous = new Date(Date.UTC(y, m - 2, 1) - HOUR).toISOString()
    await fixture.client`insert into subscription_emails(owner_id,message_key,recipients,allowance_key,queued_at) values
      (${testOwnerId},'old-1',2,${`month:${plusOne}`},now()),
      (${testOwnerId},'old-2',3,${`month:${utc}`},now()),
      (${testOwnerId},'old-previous',7,${`month:${previous}`},now() - interval '40 days'),
      (${testOwnerId},'other-key',11,'month:unrelated',now())`
    await tenantDatabase(fixture.db, testOrganizationId).transaction((tx) =>
      subscriptions.reserveEmail(tx, 'new-1', 4),
    )
    const [row] =
      await fixture.client`select allowance_key from subscription_emails where message_key='new-1'`
    expect(row!.allowance_key).toBe(`month:${month}`)
    expect((await subscriptions.summary(testOwnerId)).usage.businessEmails).toBe(2 + 3 + 4)
  })
})
