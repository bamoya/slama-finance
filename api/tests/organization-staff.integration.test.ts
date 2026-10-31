import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/env.js'
import { createPasswordService } from '../src/modules/organization/identity/auth/services/password.service.js'
import { createStaffRepository } from '../src/modules/organization/identity/staff/repositories/staff.repository.js'
import { attachTestDatabase, isolatedDatabase, testUserId } from './helpers/postgres.js'

const ownerId = '22222222-2222-4222-8222-222222222222'
const orgA = '33333333-3333-4333-8333-333333333333'
const orgB = '44444444-4444-4444-8444-444444444444'
const headers = { origin: 'http://localhost:5173' }
const shared = 'sara@example.test'
const passwordA = 'sara-password-one-2026'
const passwordB = 'sara-password-two-2026'

describe('Organization-scoped staff identities', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let app: Awaited<ReturnType<typeof buildApp>>
  let emails: { to: string; resetUrl: string }[]
  beforeEach(async () => {
    fixture = await isolatedDatabase()
    emails = []
    await fixture.client`insert into platform_users (id,email,password_hash,email_verified_at) values (${ownerId},'owner@example.test','test-only',now())`
    await fixture.client`insert into organizations(id,owner_id,name,slug,activated_at) values (${orgA},${ownerId},'A','a',now()),(${orgB},${ownerId},'B','b',now())`
    const passwords = createPasswordService()
    await fixture.client`insert into users(organization_id,email,password_hash,must_change_password) values
    (${orgA},${shared},${await passwords.hash(passwordA)},false),(${orgB},${shared},${await passwords.hash(passwordB)},false)`
    app = await buildApp({
      environment: loadEnvironment({ NODE_ENV: 'test' }),
      logger: false,
      passwordReset: {
        resetUrl: 'http://localhost:5173/reset-password',
        adapter: {
          async send(email) {
            emails.push(email)
          },
        },
      },
    })
    attachTestDatabase(app, fixture)
  })
  afterEach(async () => {
    await app?.close()
    await fixture?.cleanup()
  })
  const post = (id: string, path: string, body: object, cookies?: Record<string, string>) =>
    app.inject({
      method: 'POST',
      url: `/v1/organizations/${id}/auth/${path}`,
      headers,
      payload: body,
      cookies,
    })
  const session = (id: string, cookie: string) =>
    app.inject({
      method: 'GET',
      url: `/v1/organizations/${id}/auth/session`,
      cookies: { slama_staff_session: cookie },
    })

  it('keeps the same email independent across organizations and rejects cross-org sessions', async () => {
    expect((await post(orgB, 'login', { email: shared, password: passwordA })).statusCode).toBe(401)
    const loginA = await post(orgA, 'login', { email: shared, password: passwordA })
    const loginB = await post(orgB, 'login', { email: shared, password: passwordB })
    expect(loginA.statusCode).toBe(200)
    expect(loginB.statusCode).toBe(200)
    const cookie = loginA.cookies.find((c) => c.name === 'slama_staff_session')!
    expect(cookie.path).toBe('/v1')
    expect((await session(orgA, cookie.value)).statusCode).toBe(200)
    expect((await session(orgB, cookie.value)).statusCode).toBe(401)
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/v1/auth/session',
          cookies: { slama_session: cookie.value },
        })
      ).statusCode,
    ).toBe(401)
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/v1/staff',
          cookies: { slama_session: cookie.value },
        })
      ).statusCode,
    ).toBe(403)
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/auth/login',
          headers,
          payload: { email: shared, password: passwordA },
        })
      ).statusCode,
    ).toBe(401)
  })

  it('limits unassigned staff lists and prevents foreign role or credential scope assignments', async () => {
    const unassigned = createStaffRepository(() => fixture.db)
    expect(
      (
        await unassigned.list({
          page: 1,
          pageSize: 20,
          status: 'current',
          sort: 'email',
          direction: 'asc',
        })
      ).items.map((u) => u.id),
    ).toEqual([testUserId])
    const [a] = await fixture.client`select id from users where organization_id=${orgA}`
    const [b] =
      await fixture.client`insert into roles(organization_id,key,name) values (${orgB},'operator','Operator') returning id`
    await expect(
      fixture.client`insert into user_roles(user_id,role_id) values (${a!.id},${b!.id})`,
    ).rejects.toMatchObject({ code: expect.stringMatching(/^2350[34]$|^23514$/) })
    await expect(
      fixture.client`insert into sessions(user_id,token_hash,expires_at) values (${a!.id},${'0'.repeat(64)},now()+interval '1 day')`,
    ).rejects.toMatchObject({ code: expect.stringMatching(/^2350[34]$|^23514$/) })
    await expect(
      fixture.client`insert into sessions(organization_id,user_id,token_hash,expires_at) values (${orgB},${a!.id},${'1'.repeat(64)},now()+interval '1 day')`,
    ).rejects.toMatchObject({ code: '23503' })
  })

  it('binds password recovery to its organization and leaves the other account unchanged', async () => {
    expect((await post(orgA, 'password-reset/request', { email: shared })).statusCode).toBe(202)
    expect(emails).toHaveLength(1)
    const url = new URL(emails[0]!.resetUrl)
    expect(url.pathname).toBe(`/organizations/${orgA}/reset-password`)
    const token = new URLSearchParams(url.hash.slice(1)).get('token')!
    expect(
      (await post(orgB, 'password-reset/confirm', { token, password: 'new-password-one-2026' }))
        .statusCode,
    ).toBe(400)
    expect(
      (await post(orgA, 'password-reset/confirm', { token, password: 'new-password-one-2026' }))
        .statusCode,
    ).toBe(204)
    expect(
      (await post(orgA, 'login', { email: shared, password: 'new-password-one-2026' })).statusCode,
    ).toBe(200)
    expect((await post(orgB, 'login', { email: shared, password: passwordB })).statusCode).toBe(200)
  })

  it('revokes sessions on pause and keeps staff access unavailable until reactivation', async () => {
    const login = await post(orgA, 'login', { email: shared, password: passwordA })
    const cookie = login.cookies[0]!.value
    await fixture.client`update organizations set paused_at=now() where id=${orgA}`
    expect((await session(orgA, cookie)).json().code).toBe('ORGANIZATION_SUSPENDED')
    expect((await post(orgA, 'login', { email: shared, password: passwordA })).statusCode).toBe(403)
    await fixture.client`update organizations set paused_at=null where id=${orgA}`
    expect((await session(orgA, cookie)).statusCode).toBe(401)
    expect((await post(orgA, 'login', { email: shared, password: passwordA })).statusCode).toBe(200)
  })
})
