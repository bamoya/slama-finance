import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/env.js'
import { createPasswordService } from '../src/modules/identity/auth/services/password.service.js'
import { isolatedDatabase, testUserId } from './helpers/postgres.js'

describe('temporary credentials and password changes', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let app: Awaited<ReturnType<typeof buildApp>>
  let adminCookies: { slama_session: string }
  let created: { id: string; temporaryPassword: string; temporaryPasswordExpiresAt: string }
  const headers = { origin: 'http://localhost:5173' }
  beforeEach(async () => {
    fixture = await isolatedDatabase()
    const hash = await createPasswordService().hash('admin-password-123')
    await fixture.client`update users set password_hash=${hash} where id=${testUserId}`
    await fixture.client`insert into user_roles (user_id, role_id) select ${testUserId}, id from roles where key='admin'`
    app = await buildApp({ environment: loadEnvironment({ NODE_ENV: 'test' }), logger: false })
    app.database = () => fixture.db
    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers,
      payload: { email: 'operator@example.test', password: 'admin-password-123' },
    })
    adminCookies = { slama_session: login.cookies[0]!.value }
    const [role] = await fixture.client`select id from roles where key='admin'`
    const response = await app.inject({
      method: 'POST',
      url: '/v1/staff',
      headers,
      cookies: adminCookies,
      payload: {
        email: 'new@example.test',
        firstName: 'New',
        lastName: 'Staff',
        roleIds: [role!.id],
      },
    })
    expect(response.statusCode).toBe(201)
    expect(response.headers['cache-control']).toBe('no-store')
    created = response.json()
  })
  afterEach(async () => {
    await app?.close()
    await fixture?.cleanup()
  })
  it('lets a full-session user update only their own profile without staff permissions', async () => {
    await fixture.client`delete from user_roles where user_id=${testUserId}`
    const payload = {
      firstName: 'My',
      lastName: 'Profile',
      email: 'profile@example.test',
      currentPassword: 'admin-password-123',
    }
    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/auth/profile',
      headers,
      cookies: adminCookies,
      payload,
    })
    expect(response.statusCode).toBe(200)
    expect(response.json().user).toMatchObject({
      id: testUserId,
      firstName: 'My',
      email: 'profile@example.test',
    })
    expect(response.json().permissionKeys).toEqual([])
    expect(response.json().user).not.toHaveProperty('passwordHash')
    const wrong = await app.inject({
      method: 'PATCH',
      url: '/v1/auth/profile',
      headers,
      cookies: adminCookies,
      payload: { ...payload, currentPassword: 'wrong' },
    })
    expect(wrong.statusCode).toBe(400)
    const duplicate = await app.inject({
      method: 'PATCH',
      url: '/v1/auth/profile',
      headers,
      cookies: adminCookies,
      payload: { ...payload, email: 'new@example.test' },
    })
    expect(duplicate.statusCode).toBe(409)
  })
  const login = (password = created.temporaryPassword) =>
    app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers,
      payload: { email: 'new@example.test', password },
    })
  it('consumes the temporary password once and restricts access until replacement', async () => {
    const [stored] = await fixture.client`select * from users where id=${created.id}`
    expect(stored!.password_hash).not.toBe(created.temporaryPassword)
    expect(stored!.must_change_password).toBe(true)
    expect(new Date(created.temporaryPasswordExpiresAt).getTime()).toBeGreaterThan(Date.now())
    const first = await login()
    expect(first.statusCode).toBe(200)
    expect(first.json().purpose).toBe('password_change')
    expect(first.json().permissionKeys).toEqual([])
    expect(first.headers['set-cookie']).toContain('Max-Age=900')
    const cookies = { slama_session: first.cookies[0]!.value }
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: '/v1/auth/profile',
          headers,
          cookies,
          payload: {
            firstName: 'New',
            lastName: 'Staff',
            email: 'new@example.test',
            currentPassword: created.temporaryPassword,
          },
        })
      ).statusCode,
    ).toBe(403)
    expect((await login()).statusCode).toBe(401)
    expect((await app.inject({ url: '/v1/auth/session', cookies })).json().purpose).toBe(
      'password_change',
    )
    for (const url of ['/v1/staff', '/v1/rbac/roles', '/v1/rbac/permissions'])
      expect((await app.inject({ url, cookies })).statusCode).toBe(403)
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/auth/change-password',
          headers,
          cookies,
          payload: { newPassword: created.temporaryPassword },
        })
      ).json().code,
    ).toBe('PASSWORD_REUSED')
    const changed = await app.inject({
      method: 'POST',
      url: '/v1/auth/change-password',
      headers,
      cookies,
      payload: { newPassword: 'permanent-password-123' },
    })
    expect(changed.statusCode).toBe(200)
    expect(changed.json().purpose).toBe('full')
    expect((await app.inject({ url: '/v1/auth/session', cookies })).statusCode).toBe(401)
    const full = { slama_session: changed.cookies[0]!.value }
    expect((await app.inject({ url: '/v1/staff', cookies: full })).statusCode).toBe(200)
    expect((await login('permanent-password-123')).statusCode).toBe(200)
  })
  it('allows only one concurrent temporary login', async () => {
    const results = await Promise.all([login(), login()])
    expect(results.map((result) => result.statusCode).sort()).toEqual([200, 401])
    expect(
      await fixture.client`select * from sessions where user_id=${created.id} and purpose='password_change'`,
    ).toHaveLength(1)
  })
  it('rejects expiry and supports administrator reissue without exposing it in reads', async () => {
    await fixture.client`update users set temporary_password_expires_at=now() - interval '1 minute' where id=${created.id}`
    expect((await login()).statusCode).toBe(401)
    const reissue = await app.inject({
      method: 'POST',
      url: `/v1/staff/${created.id}/temporary-password`,
      headers,
      cookies: adminCookies,
    })
    expect(reissue.statusCode).toBe(200)
    expect(reissue.json().temporaryPassword).not.toBe(created.temporaryPassword)
    expect((await login(reissue.json().temporaryPassword)).statusCode).toBe(200)
    expect(
      (await app.inject({ url: `/v1/staff/${created.id}`, cookies: adminCookies })).json(),
    ).not.toHaveProperty('temporaryPassword')
    // An administrator who has not finished onboarding cannot replace the last full administrator.
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/v1/staff/${testUserId}/disable`,
          headers,
          cookies: adminCookies,
        })
      ).statusCode,
    ).toBe(409)
  })
  it('requires current password for a full session and rotates it atomically', async () => {
    const missing = await app.inject({
      method: 'POST',
      url: '/v1/auth/change-password',
      headers,
      cookies: adminCookies,
      payload: { newPassword: 'replacement-admin-123' },
    })
    expect(missing.statusCode).toBe(400)
    const changed = await app.inject({
      method: 'POST',
      url: '/v1/auth/change-password',
      headers,
      cookies: adminCookies,
      payload: { currentPassword: 'admin-password-123', newPassword: 'replacement-admin-123' },
    })
    expect(changed.statusCode).toBe(200)
    expect((await app.inject({ url: '/v1/auth/session', cookies: adminCookies })).statusCode).toBe(
      401,
    )
    expect(
      (
        await app.inject({
          url: '/v1/auth/session',
          cookies: { slama_session: changed.cookies[0]!.value },
        })
      ).statusCode,
    ).toBe(200)
  })
})
