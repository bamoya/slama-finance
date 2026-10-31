import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/env.js'
import { createPasswordService } from '../src/modules/organization/identity/auth/services/password.service.js'
import { attachTestDatabase, isolatedDatabase, testUserId } from './helpers/postgres.js'

describe('action permissions', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let app: Awaited<ReturnType<typeof buildApp>>
  let cookies: { slama_session: string }
  let roleId: string
  const headers = {
    origin: 'http://localhost:5173',
    'x-organization-id': '10000000-0000-4000-8000-000000000001',
  }
  const missingId = randomUUID()
  beforeAll(async () => {
    fixture = await isolatedDatabase()
    const hash = await createPasswordService().hash('permission-test-password')
    await fixture.client`update users set password_hash=${hash} where id=${testUserId}`
    const [role] =
      await fixture.client`insert into roles (key,name) values ('delegate','Delegate') returning id`
    roleId = role!.id
    await fixture.client`insert into user_roles (user_id,role_id) values (${testUserId},${roleId})`
    app = await buildApp({ environment: loadEnvironment({ NODE_ENV: 'test' }), logger: false })
    attachTestDatabase(app, fixture)
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers,
      payload: { email: 'operator@example.test', password: 'permission-test-password' },
    })
    expect(response.statusCode).toBe(200)
    cookies = { slama_session: response.cookies[0]!.value }
  })
  afterAll(async () => {
    await app?.close()
    await fixture?.cleanup()
  })
  const writes = [
    ['POST', '/api/v1/rbac/roles', 'roles.create'],
    ['PUT', `/api/v1/rbac/roles/${missingId}/permissions`, 'roles.update'],
    ['DELETE', `/api/v1/rbac/roles/${missingId}`, 'roles.delete'],
    ['POST', '/api/v1/staff', 'staff.create'],
    ['PATCH', `/api/v1/staff/${missingId}`, 'staff.update'],
    ['PUT', `/api/v1/staff/${missingId}/roles`, 'staff.update'],
    ['POST', `/api/v1/staff/${missingId}/disable`, 'staff.update'],
    ['POST', `/api/v1/staff/${missingId}/enable`, 'staff.update'],
    ['POST', `/api/v1/staff/${missingId}/archive`, 'staff.update'],
    ['DELETE', `/api/v1/staff/${missingId}`, 'staff.delete'],
    ['POST', `/api/v1/staff/${missingId}/temporary-password`, 'staff.update'],
    ['PATCH', '/api/v1/company-settings', 'company_settings.update'],
    ['POST', '/api/v1/bank-accounts', 'bank_accounts.create'],
    ['PATCH', `/api/v1/bank-accounts/${missingId}`, 'bank_accounts.update'],
    ['POST', `/api/v1/bank-accounts/${missingId}/archive`, 'bank_accounts.update'],
    ['POST', `/api/v1/bank-accounts/${missingId}/restore`, 'bank_accounts.update'],
    ['DELETE', `/api/v1/bank-accounts/${missingId}`, 'bank_accounts.delete'],
    ['POST', '/api/v1/document-templates', 'templates.create'],
    ['PATCH', `/api/v1/document-templates/${missingId}`, 'templates.update'],
    ['POST', `/api/v1/document-templates/${missingId}/archive`, 'templates.update'],
    ['DELETE', `/api/v1/document-templates/${missingId}`, 'templates.delete'],
  ] as const
  it.each(writes)('%s %s requires precisely %s', async (method, url, permission) => {
    await fixture.client`delete from role_permissions where role_id=${roleId}`
    await fixture.client`insert into role_permissions (role_id,permission_id) select ${roleId},id from permissions where key <> ${permission}`
    expect((await app.inject({ method, url, cookies, headers, payload: {} })).statusCode).toBe(403)
    await fixture.client`delete from role_permissions where role_id=${roleId}`
    await fixture.client`insert into role_permissions (role_id,permission_id) select ${roleId},id from permissions where key = ${permission} or (${url.startsWith('/api/v1/staff/') && url.endsWith('/roles')} and key='roles.update')`
    const response = await app.inject({ method, url, cookies, headers, payload: {} })
    // Authorized, then rejected for missing input or missing target; unrelated grants aren't required.
    expect([400, 404]).toContain(response.statusCode)
  })
  it.each(['staff.update', 'roles.update'])(
    'requires both assignment grants, not just %s',
    async (key) => {
      await fixture.client`delete from role_permissions where role_id=${roleId}`
      await fixture.client`insert into role_permissions (role_id,permission_id) select ${roleId},id from permissions where key=${key}`
      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/staff/${missingId}/roles`,
        cookies,
        headers,
        payload: { roleIds: [] },
      })
      expect(response.statusCode).toBe(403)
    },
  )
  it('requires roles.update independently when creating staff with initial roles', async () => {
    await fixture.client`delete from role_permissions where role_id=${roleId}`
    await fixture.client`insert into role_permissions (role_id,permission_id) select ${roleId},id from permissions where key='staff.create'`
    const [empty] =
      await fixture.client`insert into roles (key,name) values ('empty','Empty') returning id`
    const input = {
      firstName: 'New',
      lastName: 'Staff',
      email: 'new@example.test',
      roleIds: [empty!.id],
    }
    expect(
      (await app.inject({ method: 'POST', url: '/api/v1/staff', cookies, headers, payload: input }))
        .statusCode,
    ).toBe(403)
    expect(await fixture.client`select id from users where email='new@example.test'`).toHaveLength(
      0,
    )
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/staff',
          cookies,
          headers,
          payload: { ...input, roleIds: [] },
        })
      ).statusCode,
    ).toBe(201)
  })
})
