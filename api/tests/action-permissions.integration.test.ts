import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/env.js'
import { createPasswordService } from '../src/modules/identity/auth/services/password.service.js'
import { isolatedDatabase, testUserId } from './helpers/postgres.js'

describe('action permissions', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let app: Awaited<ReturnType<typeof buildApp>>
  let cookies: { slama_session: string }
  let roleId: string
  const headers = { origin: 'http://localhost:5173' }
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
    app.database = () => fixture.db
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
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
    ['POST', '/v1/rbac/roles', 'roles.create'],
    ['PUT', `/v1/rbac/roles/${missingId}/permissions`, 'roles.update'],
    ['DELETE', `/v1/rbac/roles/${missingId}`, 'roles.delete'],
    ['POST', '/v1/staff', 'staff.create'],
    ['PATCH', `/v1/staff/${missingId}`, 'staff.update'],
    ['PUT', `/v1/staff/${missingId}/roles`, 'staff.update'],
    ['POST', `/v1/staff/${missingId}/disable`, 'staff.update'],
    ['POST', `/v1/staff/${missingId}/enable`, 'staff.update'],
    ['DELETE', `/v1/staff/${missingId}`, 'staff.update'],
    ['POST', `/v1/staff/${missingId}/temporary-password`, 'staff.update'],
    ['PATCH', '/v1/company-settings', 'company_settings.update'],
    ['POST', '/v1/bank-accounts', 'bank_accounts.create'],
    ['PATCH', `/v1/bank-accounts/${missingId}`, 'bank_accounts.update'],
    ['POST', `/v1/bank-accounts/${missingId}/archive`, 'bank_accounts.update'],
    ['POST', `/v1/bank-accounts/${missingId}/restore`, 'bank_accounts.update'],
    ['DELETE', `/v1/bank-accounts/${missingId}`, 'bank_accounts.delete'],
    ['POST', '/v1/document-templates', 'templates.create'],
    ['PATCH', `/v1/document-templates/${missingId}`, 'templates.update'],
    ['POST', `/v1/document-templates/${missingId}/archive`, 'templates.update'],
    ['DELETE', `/v1/document-templates/${missingId}`, 'templates.delete'],
  ] as const
  it.each(writes)('%s %s requires precisely %s', async (method, url, permission) => {
    await fixture.client`delete from role_permissions where role_id=${roleId}`
    await fixture.client`insert into role_permissions (role_id,permission_id) select ${roleId},id from permissions where key <> ${permission}`
    expect((await app.inject({ method, url, cookies, headers, payload: {} })).statusCode).toBe(403)
    await fixture.client`delete from role_permissions where role_id=${roleId}`
    await fixture.client`insert into role_permissions (role_id,permission_id) select ${roleId},id from permissions where key = ${permission} or (${url.startsWith('/v1/staff/') && url.endsWith('/roles')} and key='roles.update')`
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
        url: `/v1/staff/${missingId}/roles`,
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
      (await app.inject({ method: 'POST', url: '/v1/staff', cookies, headers, payload: input }))
        .statusCode,
    ).toBe(403)
    expect(await fixture.client`select id from users where email='new@example.test'`).toHaveLength(
      0,
    )
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/staff',
          cookies,
          headers,
          payload: { ...input, roleIds: [] },
        })
      ).statusCode,
    ).toBe(201)
  })
})

it('migrates legacy grants to CRUD without adding permanent Delete to delegated roles', async () => {
  const fixture = await isolatedDatabase(async (name, client) => {
    if (name !== '0002_action_permissions.sql') return
    await client`insert into roles (key,name) values ('legacy','Legacy'),('reader','Reader')`
    await client`insert into role_permissions (role_id,permission_id) select r.id,p.id from roles r cross join permissions p where r.key='legacy' and p.key in ('roles.manage','staff.manage','settings.view','settings.update','bank_accounts.view','bank_accounts.manage','templates.view','templates.manage')`
    await client`insert into role_permissions (role_id,permission_id) select r.id,p.id from roles r cross join permissions p where r.key='reader' and p.key in ('settings.view','bank_accounts.view','templates.view')`
  })
  try {
    const grants = async (key: string) =>
      (
        await fixture.client`select p.key from permissions p join role_permissions rp on rp.permission_id=p.id join roles r on r.id=rp.role_id where r.key=${key}`
      )
        .map((row) => row.key)
        .sort()
    expect(await grants('reader')).toEqual([
      'bank_accounts.read',
      'company_settings.read',
      'templates.read',
    ])
    const legacy = await grants('legacy')
    expect(legacy).toEqual(
      [
        'roles.create',
        'roles.update',
        'roles.delete',
        'staff.create',
        'staff.update',
        'company_settings.read',
        'company_settings.update',
        'bank_accounts.read',
        'bank_accounts.create',
        'bank_accounts.update',
        'templates.read',
        'templates.create',
        'templates.update',
      ].sort(),
    )
    expect(await grants('admin')).toEqual(
      expect.arrayContaining(['bank_accounts.update', 'bank_accounts.delete', 'templates.delete']),
    )
    expect(
      await fixture.client`select key from permissions where key like '%.manage' or key like '%.view' or key like 'settings.%'`,
    ).toHaveLength(0)
  } finally {
    await fixture.cleanup()
  }
})
