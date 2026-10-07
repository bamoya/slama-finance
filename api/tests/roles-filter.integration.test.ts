import { randomUUID } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/env.js'
import { createPasswordService } from '../src/modules/identity/auth/services/password.service.js'
import { isolatedDatabase, testUserId } from './helpers/postgres.js'
describe('role deletion and staff role filters', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let app: Awaited<ReturnType<typeof buildApp>>
  let cookies: { slama_session: string }
  let passwordHash: string
  const headers = { origin: 'http://localhost:5173' }
  beforeEach(async () => {
    fixture = await isolatedDatabase()
    passwordHash = await createPasswordService().hash('test-password-123')
    await fixture.client`UPDATE users SET password_hash=${passwordHash} WHERE id=${testUserId}`
    await fixture.client`INSERT INTO user_roles (user_id, role_id) SELECT ${testUserId}, id FROM roles WHERE key='admin'`
    app = await buildApp({
      environment: loadEnvironment({ NODE_ENV: 'test', CORS_ORIGIN: headers.origin }),
      logger: false,
    })
    app.database = () => fixture.db
    cookies = await login('operator@example.test')
  })
  afterEach(async () => {
    await app?.close()
    await fixture?.cleanup()
  })
  async function login(email: string) {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers,
      payload: { email, password: 'test-password-123' },
    })
    expect(response.statusCode).toBe(200)
    return { slama_session: response.cookies[0]!.value }
  }
  async function role(key: string, permissionKeys: string[] = []) {
    const [record] =
      await fixture.client`INSERT INTO roles (key,name) VALUES (${key},${key}) RETURNING id`
    for (const permission of permissionKeys)
      await fixture.client`INSERT INTO role_permissions (role_id,permission_id) SELECT ${record!.id}, id FROM permissions WHERE key=${permission}`
    return record!.id as string
  }
  async function user(name: string, roleIds: string[]) {
    const [record] =
      await fixture.client`INSERT INTO users (email,password_hash,first_name,last_name,must_change_password) VALUES (${name + '@example.test'},${passwordHash},${name},'Test',false) RETURNING id`
    await fixture.client`INSERT INTO user_settings (user_id) VALUES (${record!.id})`
    for (const roleId of roleIds)
      await fixture.client`INSERT INTO user_roles (user_id,role_id) VALUES (${record!.id},${roleId})`
    return record!.id as string
  }
  it('cascades assignments without deleting users and preserves other role permissions', async () => {
    const removed = await role('removed', ['staff.read'])
    const kept = await role('kept', ['roles.read'])
    const multi = await user('multi', [removed, kept])
    const single = await user('single', [removed])
    const multiCookies = await login('multi@example.test')
    const singleCookies = await login('single@example.test')
    expect(
      (await app.inject({ method: 'DELETE', url: '/v1/rbac/roles/' + removed, cookies, headers }))
        .statusCode,
    ).toBe(204)
    expect(await fixture.client`SELECT * FROM user_roles WHERE role_id=${removed}`).toHaveLength(0)
    expect(
      await fixture.client`SELECT * FROM role_permissions WHERE role_id=${removed}`,
    ).toHaveLength(0)
    expect(
      await fixture.client`SELECT id FROM users WHERE id IN (${multi},${single})`,
    ).toHaveLength(2)
    expect(
      await fixture.client`SELECT user_id FROM user_settings WHERE user_id IN (${multi},${single})`,
    ).toHaveLength(2)
    expect(
      (await app.inject({ url: '/v1/auth/session', cookies: multiCookies })).json().permissionKeys,
    ).toEqual(['roles.read'])
    expect(
      (await app.inject({ url: '/v1/auth/session', cookies: singleCookies })).json().permissionKeys,
    ).toEqual([])
    expect((await app.inject({ url: '/v1/staff', cookies: multiCookies })).statusCode).toBe(403)
    expect((await app.inject({ url: '/v1/rbac/roles', cookies: multiCookies })).statusCode).toBe(
      200,
    )
  })
  it('protects all system roles and validates missing and malformed IDs', async () => {
    const [admin] = await fixture.client`SELECT id FROM roles WHERE key='admin'`
    const system = await role('another-system')
    await fixture.client`UPDATE roles SET is_system=true WHERE id=${system}`
    for (const id of [admin!.id, system]) {
      const response = await app.inject({
        method: 'DELETE',
        url: '/v1/rbac/roles/' + id,
        cookies,
        headers,
      })
      expect(response.statusCode).toBe(409)
      expect(response.json().code).toBe('PROTECTED_ROLE')
    }
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: '/v1/rbac/roles/' + randomUUID(),
          cookies,
          headers,
        })
      ).statusCode,
    ).toBe(404)
    expect(
      (await app.inject({ method: 'DELETE', url: '/v1/rbac/roles/not-a-uuid', cookies, headers }))
        .statusCode,
    ).toBe(400)
    expect(
      (await app.inject({ method: 'DELETE', url: '/v1/rbac/roles/' + system, headers })).statusCode,
    ).toBe(403)
  })
  it('prevents a delegated manager deleting a higher-privilege role', async () => {
    const manage = await role('role-manager', ['roles.delete'])
    const higher = await role('higher', ['staff.create'])
    await user('delegate', [manage])
    const delegatedCookies = await login('delegate@example.test')
    const result = await app.inject({
      method: 'DELETE',
      url: '/v1/rbac/roles/' + higher,
      cookies: delegatedCookies,
      headers,
    })
    expect(result.statusCode).toBe(403)
    expect(await fixture.client`SELECT id FROM roles WHERE id=${higher}`).toHaveLength(1)
  })
  it('combines role/search/status filters with correct totals and no duplicate multi-role users', async () => {
    const a = await role('filter-a')
    const b = await role('filter-b')
    const multi = await user('needle-a', [a, b])
    const disabled = await user('needle-b', [a])
    const archived = await user('needle-c', [a])
    await user('unrelated', [b])
    await fixture.client`UPDATE users SET disabled_at=now() WHERE id=${disabled}`
    await fixture.client`UPDATE users SET archived_at=now(),disabled_at=now() WHERE id=${archived}`
    const page = (query: string) => app.inject({ url: '/v1/staff?' + query, cookies })
    const first = (
      await page('roleId=' + a + '&q=needle&status=current&pageSize=1&sort=firstName')
    ).json()
    expect(first.total).toBe(2)
    expect(first.items.map((item: { id: string }) => item.id)).toEqual([multi])
    const second = (
      await page('roleId=' + a + '&q=needle&status=current&pageSize=1&sort=firstName&page=2')
    ).json()
    expect(second.total).toBe(2)
    expect(second.items[0].id).toBe(disabled)
    expect((await page('roleId=' + a + '&status=archived')).json().items[0].id).toBe(archived)
    expect((await page('roleId=' + a + '&status=all')).json().total).toBe(3)
    expect((await page('roleId=' + b + '&q=needle')).json().total).toBe(1)
    expect((await page('roleId=' + randomUUID())).json().total).toBe(0)
    expect((await page('roleId=invalid')).statusCode).toBe(400)
  })
  it('serializes deletion against staff assignments without dangling references', async () => {
    const targetRole = await role('concurrent')
    const targetUser = await user('concurrent-user', [])
    const [assignment, deletion] = await Promise.all([
      app.inject({
        method: 'PUT',
        url: '/v1/staff/' + targetUser + '/roles',
        cookies,
        headers,
        payload: { roleIds: [targetRole] },
      }),
      app.inject({ method: 'DELETE', url: '/v1/rbac/roles/' + targetRole, cookies, headers }),
    ])
    expect(deletion.statusCode).toBe(204)
    expect([204, 400]).toContain(assignment.statusCode)
    expect(await fixture.client`SELECT * FROM user_roles WHERE role_id=${targetRole}`).toHaveLength(
      0,
    )
    expect(await fixture.client`SELECT id FROM users WHERE id=${targetUser}`).toHaveLength(1)
  })
})
