import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/env.js'
import { createPasswordService } from '../src/modules/identity/auth/services/password.service.js'
import { isolatedDatabase, testUserId } from './helpers/postgres.js'

describe('identity HTTP and persistence regression', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let app: Awaited<ReturnType<typeof buildApp>>
  const headers = { origin: 'http://localhost:5173' }
  beforeAll(async () => {
    fixture = await isolatedDatabase()
    const hash = await createPasswordService().hash('test-password-123')
    await fixture.client`update users set password_hash=${hash} where id=${testUserId}`
    await fixture.client`insert into user_roles (user_id, role_id) select ${testUserId}, id from roles where key='admin'`
    app = await buildApp({
      environment: loadEnvironment({ NODE_ENV: 'test', CORS_ORIGIN: headers.origin }),
      logger: false,
    })
    app.database = () => fixture.db
  })
  afterAll(async () => {
    await app?.close()
    await fixture?.cleanup()
  })
  async function login() {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers,
      payload: { email: 'OPERATOR@example.test', password: 'test-password-123' },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json().user).toMatchObject({ firstName: 'Test', lastName: 'Operator' })
    expect(response.json().user).not.toHaveProperty('passwordHash')
    expect(response.json().permissionKeys).toEqual(
      expect.arrayContaining(['staff.read', 'staff.create', 'roles.read', 'roles.update']),
    )
    expect(response.headers['set-cookie']).toContain('HttpOnly')
    expect(response.headers['set-cookie']).toContain('SameSite=Lax')
    return response.cookies[0]!.value
  }
  it('preserves login, session, permission checks and logout routes', async () => {
    expect((await app.inject('/v1/auth/session')).statusCode).toBe(401)
    expect((await app.inject('/v1/rbac/roles')).statusCode).toBe(403)
    const token = await login()
    const cookies = { slama_session: token }
    expect((await app.inject({ url: '/v1/auth/session', cookies })).statusCode).toBe(200)
    expect((await app.inject({ url: '/v1/rbac/roles', cookies })).statusCode).toBe(200)
    const logout = await app.inject({ method: 'POST', url: '/v1/auth/logout', cookies, headers })
    expect(logout.statusCode).toBe(204)
    expect((await app.inject({ url: '/v1/auth/session', cookies })).statusCode).toBe(401)
  })
  it('creates staff atomically, maps fields and retains role/permission operations', async () => {
    const cookies = { slama_session: await login() }
    const roleResponse = await app.inject({
      method: 'POST',
      url: '/v1/rbac/roles',
      headers,
      cookies,
      payload: { key: 'test-sales', name: 'Sales' },
    })
    expect(roleResponse.statusCode).toBe(201)
    expect(roleResponse.json().permissionKeys).toEqual([])
    const roleId = roleResponse.json().id
    const permission = (await app.inject({ url: '/v1/rbac/permissions', cookies })).json()[0]
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/v1/rbac/roles/${roleId}/permissions`,
          headers,
          cookies,
          payload: { permissionKeys: [permission.key, permission.key] },
        })
      ).statusCode,
    ).toBe(204)
    const assignments = () =>
      fixture.client`select permission_id from role_permissions where role_id=${roleId}`
    expect(await assignments()).toEqual([{ permission_id: permission.id }])
    const listed = await app.inject({ url: '/v1/rbac/roles', cookies })
    expect(listed.json().find((role: { id: string }) => role.id === roleId).permissionKeys).toEqual(
      [permission.key],
    )
    const unknown = await app.inject({
      method: 'PUT',
      url: `/v1/rbac/roles/${roleId}/permissions`,
      headers,
      cookies,
      payload: { permissionKeys: [permission.key, 'unknown.permission'] },
    })
    expect(unknown.statusCode).toBe(400)
    expect(unknown.json().fieldErrors.permissionKeys).toEqual([
      'Unknown permission: unknown.permission',
    ])
    expect(await assignments()).toEqual([{ permission_id: permission.id }])
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/v1/rbac/roles/${roleId}/permissions`,
          headers,
          cookies,
          payload: { permissionIds: [permission.id] },
        })
      ).statusCode,
    ).toBe(400)
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/v1/rbac/roles/22222222-2222-4222-8222-222222222222/permissions',
          headers,
          cookies,
          payload: { permissionKeys: [] },
        })
      ).statusCode,
    ).toBe(404)
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/v1/rbac/roles/${roleId}/permissions`,
          headers,
          cookies,
          payload: { permissionKeys: [] },
        })
      ).statusCode,
    ).toBe(204)
    expect(await assignments()).toHaveLength(0)
    const response = await app.inject({
      method: 'POST',
      url: '/v1/staff',
      headers,
      cookies,
      payload: {
        email: 'NEW@example.test',
        firstName: ' Sara ',
        lastName: 'Amrani',
        roleIds: [roleId],
      },
    })
    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({
      id: expect.any(String),
      email: 'new@example.test',
      firstName: 'Sara',
      lastName: 'Amrani',
      disabledAt: null,
      archivedAt: null,
    })
    const userId = response.json().id
    expect(await fixture.client`select * from user_settings where user_id=${userId}`).toHaveLength(
      1,
    )
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/v1/staff/${userId}/roles`,
          headers,
          cookies,
          payload: { roleIds: [] },
        })
      ).statusCode,
    ).toBe(204)
    expect(await fixture.client`select * from user_roles where user_id=${userId}`).toHaveLength(0)
    const failed = await app.inject({
      method: 'POST',
      url: '/v1/staff',
      headers,
      cookies,
      payload: {
        email: 'rollback@example.test',
        firstName: 'Roll',
        lastName: 'Back',
        roleIds: ['22222222-2222-4222-8222-222222222222'],
      },
    })
    expect(failed.statusCode).toBeGreaterThanOrEqual(400)
    expect(
      await fixture.client`select * from users where email='rollback@example.test'`,
    ).toHaveLength(0)
  })
  it('rejects wrong passwords, expired sessions and disabled accounts', async () => {
    const wrong = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers,
      payload: { email: 'operator@example.test', password: 'wrong-password' },
    })
    expect(wrong.statusCode).toBe(401)
    const token = await login()
    await fixture.client`update sessions set expires_at=now() - interval '1 minute' where user_id=${testUserId}`
    expect(
      (await app.inject({ url: '/v1/auth/session', cookies: { slama_session: token } })).statusCode,
    ).toBe(401)
    const active = await login()
    await fixture.client`update users set disabled_at=now() where id=${testUserId}`
    try {
      expect(
        (await app.inject({ url: '/v1/auth/session', cookies: { slama_session: active } }))
          .statusCode,
      ).toBe(401)
      expect(
        (await app.inject({ url: '/v1/rbac/roles', cookies: { slama_session: active } }))
          .statusCode,
      ).toBe(403)
    } finally {
      await fixture.client`update users set disabled_at=null where id=${testUserId}`
    }
  })
})
