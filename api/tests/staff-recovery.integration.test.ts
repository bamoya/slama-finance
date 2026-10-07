import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/env.js'
import { createPasswordService } from '../src/modules/identity/auth/services/password.service.js'
import { isolatedDatabase, testUserId } from './helpers/postgres.js'
import { createTestResetEmail } from './helpers/test-reset-email.js'

describe('staff lifecycle and password recovery', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let app: Awaited<ReturnType<typeof buildApp>>
  let mail: ReturnType<typeof createTestResetEmail>
  let cookies: { slama_session: string }
  const headers = { origin: 'http://localhost:5173' }
  beforeEach(async () => {
    fixture = await isolatedDatabase()
    mail = createTestResetEmail()
    const hash = await createPasswordService().hash('test-password-123')
    await fixture.client`update users set password_hash=${hash} where id=${testUserId}`
    await fixture.client`insert into user_roles (user_id, role_id) select ${testUserId}, id from roles where key='admin'`
    app = await buildApp({
      environment: loadEnvironment({ NODE_ENV: 'test', CORS_ORIGIN: headers.origin }),
      logger: false,
      passwordReset: { adapter: mail.adapter, resetUrl: 'http://localhost:5173/reset-password' },
    })
    app.database = () => fixture.db
    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers,
      payload: { email: 'operator@example.test', password: 'test-password-123' },
    })
    cookies = { slama_session: login.cookies[0]!.value }
  })
  afterEach(async () => {
    await app?.close()
    await fixture?.cleanup()
  })
  const requestReset = (email: string) =>
    app.inject({
      method: 'POST',
      url: '/v1/auth/password-reset/request',
      headers,
      payload: { email },
    })
  const token = () =>
    new URLSearchParams(new URL(mail.messages.at(-1)!.resetUrl).hash.slice(1)).get('token')!
  const confirm = (value: string) =>
    app.inject({
      method: 'POST',
      url: '/v1/auth/password-reset/confirm',
      headers,
      payload: { token: value, password: 'replacement-password-123' },
    })
  async function createStaff(roleIds: string[] = []) {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/staff',
      headers,
      cookies,
      payload: {
        email: 'staff@example.test',
        firstName: 'Sara',
        lastName: 'Amrani',
        roleIds,
      },
    })
    expect(response.statusCode).toBe(201)
    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers,
      payload: { email: 'staff@example.test', password: response.json().temporaryPassword },
    })
    expect(login.json().purpose).toBe('password_change')
    const changed = await app.inject({
      method: 'POST',
      url: '/v1/auth/change-password',
      headers,
      cookies: { slama_session: login.cookies[0]!.value },
      payload: { newPassword: 'staff-password-123' },
    })
    expect(changed.statusCode).toBe(200)
    return response.json().id as string
  }
  it('lists, updates, disables/enables and archives without deleting references', async () => {
    const id = await createStaff()
    expect((await app.inject({ url: '/v1/staff', cookies })).json().items).toHaveLength(2)
    expect((await app.inject({ url: `/v1/staff/${id}`, cookies })).json()).toMatchObject({
      roles: [],
      permissionKeys: [],
    })
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/v1/staff/${id}`,
          cookies,
          headers,
          payload: { firstName: 'New' },
        })
      ).json().firstName,
    ).toBe('New')
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/v1/staff/${id}`,
          cookies,
          headers,
          payload: { permissionKeys: ['staff.create'] },
        })
      ).statusCode,
    ).toBe(400)
    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers,
      payload: { email: 'staff@example.test', password: 'staff-password-123' },
    })
    const staffCookies = { slama_session: login.cookies[0]!.value }
    expect(
      (await app.inject({ method: 'POST', url: `/v1/staff/${id}/disable`, headers, cookies }))
        .statusCode,
    ).toBe(204)
    expect((await app.inject({ url: '/v1/auth/session', cookies: staffCookies })).statusCode).toBe(
      401,
    )
    expect(
      (await app.inject({ method: 'POST', url: `/v1/staff/${id}/enable`, headers, cookies }))
        .statusCode,
    ).toBe(204)
    expect((await app.inject({ url: '/v1/auth/session', cookies: staffCookies })).statusCode).toBe(
      401,
    )
    expect(
      (await app.inject({ method: 'DELETE', url: `/v1/staff/${id}`, headers, cookies })).statusCode,
    ).toBe(204)
    expect((await app.inject({ url: '/v1/staff', cookies })).json().total).toBe(1)
    expect(
      (await app.inject({ url: '/v1/staff?status=archived', cookies })).json().items[0].id,
    ).toBe(id)
    expect(await fixture.client`select * from users where id=${id}`).toHaveLength(1)
    expect(await fixture.client`select * from user_settings where user_id=${id}`).toHaveLength(1)
    expect(
      (await app.inject({ method: 'POST', url: `/v1/staff/${id}/enable`, headers, cookies }))
        .statusCode,
    ).toBe(409)
    expect((await requestReset('staff@example.test')).statusCode).toBe(202)
    expect(mail.messages).toHaveLength(0)
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/v1/rbac/users/${id}/roles`,
          headers,
          cookies,
          payload: { roleIds: [] },
        })
      ).statusCode,
    ).toBe(404)
  })
  it('protects the last administrator and system grants', async () => {
    for (const action of ['disable', 'archive', 'roles']) {
      const response = await app.inject({
        method: action === 'roles' ? 'PUT' : action === 'archive' ? 'DELETE' : 'POST',
        url: `/v1/staff/${testUserId}${action === 'archive' ? '' : '/' + action}`,
        headers,
        cookies,
        ...(action === 'roles' ? { payload: { roleIds: [] } } : {}),
      })
      expect(response.statusCode).toBe(409)
      expect(response.json().code).toBe('LAST_ADMIN')
    }
    const [admin] = await fixture.client`select id from roles where key='admin'`
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/v1/rbac/roles/${admin!.id}/permissions`,
          headers,
          cookies,
          payload: { permissionKeys: [] },
        })
      ).statusCode,
    ).toBe(409)
  })
  it('serializes competing administrator removals', async () => {
    const [admin] = await fixture.client`select id from roles where key='admin'`
    const second = await createStaff([admin!.id])
    const results = await Promise.all(
      [testUserId, second].map((id) =>
        app.inject({ method: 'POST', url: `/v1/staff/${id}/disable`, headers, cookies }),
      ),
    )
    expect(results.filter((result) => result.statusCode === 204)).toHaveLength(1)
    const active =
      await fixture.client`select id from users where disabled_at is null and archived_at is null`
    expect(active).toHaveLength(1)
  })
  it('uses generic email responses, stores hashes, consumes once and revokes sessions', async () => {
    const unknown = await requestReset('nobody@example.test')
    const known = await requestReset('operator@example.test')
    expect(unknown.statusCode).toBe(202)
    expect(known.json()).toEqual(unknown.json())
    expect(mail.messages).toHaveLength(1)
    const value = token()
    const [stored] = await fixture.client`select token_hash from password_reset_tokens`
    expect(stored!.token_hash).not.toBe(value)
    expect((await confirm(value)).statusCode).toBe(204)
    expect((await confirm(value)).statusCode).toBe(400)
    expect((await app.inject({ url: '/v1/auth/session', cookies })).statusCode).toBe(401)
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/auth/login',
          headers,
          payload: { email: 'operator@example.test', password: 'replacement-password-123' },
        })
      ).statusCode,
    ).toBe(200)
  })
  it('rejects expired reset links and delivers no email for disabled users', async () => {
    await requestReset('operator@example.test')
    const value = token()
    await fixture.client`update password_reset_tokens set expires_at=now() - interval '1 minute'`
    expect((await confirm(value)).statusCode).toBe(400)
    await fixture.client`update users set disabled_at=now() where id=${testUserId}`
    expect((await requestReset('operator@example.test')).statusCode).toBe(202)
    expect(mail.messages).toHaveLength(1)
  })
  it('allows only one simultaneous reset with the same token', async () => {
    await requestReset('operator@example.test')
    const results = await Promise.all([confirm(token()), confirm(token())])
    expect(results.map((result) => result.statusCode).sort()).toEqual([204, 400])
  })
})
