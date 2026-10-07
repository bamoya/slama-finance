import { expect, it } from 'vitest'

import { isolatedDatabase } from './helpers/postgres.js'

it('consolidates state permissions without granting deletion or changing read-only roles', async () => {
  const fixture = await isolatedDatabase(async (name, sql) => {
    if (name !== '0021_crud_permissions.sql') return
    await sql`insert into roles (key,name) values ('state-only','State only'), ('reader-only','Reader'), ('delete-only','Delete only'), ('role-assigner','Assigner')`
    await sql`insert into role_permissions (role_id,permission_id)
      select r.id,p.id from roles r cross join permissions p where
      (r.key='state-only' and p.key in ('clients.archive','payments.confirm','notification_dispatches.retry')) or
      (r.key='reader-only' and p.key in ('clients.read','templates.read')) or
      (r.key='delete-only' and p.key='clients.delete') or
      (r.key='role-assigner' and p.key='staff.assign_roles')`
  })
  try {
    const grants = async (role: string) =>
      (
        await fixture.client`
      select p.key from permissions p join role_permissions rp on rp.permission_id=p.id
      join roles r on r.id=rp.role_id where r.key=${role} order by p.key`
      ).map((r) => r.key)
    expect(await grants('state-only')).toEqual([
      'clients.update',
      'notification_dispatches.update',
      'payments.update',
    ])
    expect(await grants('reader-only')).toEqual(['clients.read', 'templates.read'])
    expect(await grants('delete-only')).toEqual(['clients.delete'])
    expect(await grants('role-assigner')).toEqual(['roles.update', 'staff.update'])
    const catalog = await fixture.client`select key from permissions order by key`
    expect(catalog.every((p) => /^[a-z_]+\.(read|create|update|delete)$/.test(p.key))).toBe(true)
    expect(catalog.filter((p) => p.key.startsWith('reports.')).map((p) => p.key)).toEqual([
      'reports.read',
    ])
    const admin = await grants('admin')
    expect(admin).toEqual(catalog.map((p) => p.key))
  } finally {
    await fixture.cleanup()
  }
})
