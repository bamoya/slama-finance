import { randomUUID } from 'node:crypto'

import postgres from 'postgres'
import { expect, test } from 'vitest'

import { configuration, initializeDatabase } from '../scripts/initialize-database.mjs'

test('startup migrates once, serializes, provisions restricted access, and preserves credentials', async () => {
  const value = process.env.TEST_DATABASE_URL
  if (!value) throw new Error('TEST_DATABASE_URL is required')
  const url = new URL(value)
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.endsWith('_test'))
    throw new Error('Dedicated local test database required')
  const suffix = randomUUID().replaceAll('-', '')
  const database = `startup_test_${suffix}`
  const role = `startup_role_${suffix}`
  const admin = postgres(value, { max: 1, onnotice: () => {} })
  let owner
  let runtime
  try {
    await admin.unsafe(`CREATE DATABASE "${database}"`)
    url.pathname = `/${database}`
    const ownerUrl = url.toString()
    url.username = role
    url.password = "test_password_with_quote'and_more"
    const env = {
      MIGRATION_DATABASE_URL: ownerUrl,
      DATABASE_URL: url.toString(),
      BOOTSTRAP_ADMIN_EMAIL: 'bootstrap@example.test',
      BOOTSTRAP_ADMIN_PASSWORD: 'test-initial-password',
    }
    owner = postgres(ownerUrl, { max: 1, onnotice: () => {} })
    const attempts = await Promise.allSettled([initializeDatabase(env), initializeDatabase(env)])
    for (const attempt of attempts) if (attempt.status === 'rejected') throw attempt.reason
    const before = await owner`SELECT count(*) FROM drizzle.__drizzle_migrations`
    expect(Number(before[0].count)).toBeGreaterThan(0)
    const [user] = await owner`SELECT * FROM public.users`
    expect(user.email).toBe(env.BOOTSTRAP_ADMIN_EMAIL)
    expect(user.must_change_password).toBe(true)
    expect(user.temporary_password_expires_at).not.toBeNull()
    const { createPasswordService } =
      await import('../dist/src/modules/identity/auth/services/password.service.js')
    expect(
      await createPasswordService().verify(env.BOOTSTRAP_ADMIN_PASSWORD, user.password_hash),
    ).toBe(true)
    expect((await owner`SELECT count(*) FROM public.user_roles`)[0].count).toBe('1')
    expect(
      (
        await owner`SELECT count(*) FROM public.role_permissions rp JOIN public.roles r ON r.id = rp.role_id WHERE r.key = 'admin'`
      )[0].count,
    ).toBe((await owner`SELECT count(*) FROM public.permissions`)[0].count)
    await initializeDatabase({ ...env, BOOTSTRAP_ADMIN_PASSWORD: '' })
    expect((await owner`SELECT password_hash FROM public.users`)[0].password_hash).toBe(
      user.password_hash,
    )
    await initializeDatabase(env)
    expect(await owner`SELECT count(*) FROM drizzle.__drizzle_migrations`).toEqual(before)
    runtime = postgres(env.DATABASE_URL, { max: 1 })
    expect((await runtime`SELECT count(*) FROM public.permissions`)[0].count).not.toBe('0')
    const [access] = await runtime`SELECT
      has_table_privilege(current_user, 'public.users', 'INSERT') AS staff,
      has_table_privilege(current_user, 'public.report_runs', 'DELETE') AS reports,
      has_table_privilege(current_user, 'public.audit_events', 'INSERT') AS audit_insert,
      has_table_privilege(current_user, 'public.audit_events', 'DELETE') AS audit_delete,
      has_table_privilege(current_user, 'public.users', 'TRUNCATE') AS truncate`
    expect(access).toEqual({
      staff: true,
      reports: true,
      audit_insert: true,
      audit_delete: false,
      truncate: false,
    })
    await expect(runtime`CREATE TABLE public.forbidden (id int)`).rejects.toThrow()
    url.password = 'different_password_do_not_rotate'
    await expect(initializeDatabase({ ...env, DATABASE_URL: url.toString() })).rejects.toThrow()
    await initializeDatabase(env)
  } finally {
    await runtime?.end({ timeout: 2 })
    await owner?.end({ timeout: 2 })
    // Only drop the dedicated, randomly named database and role created above.
    await admin.unsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
    await admin.unsafe(`DROP ROLE IF EXISTS "${role}"`)
    await admin.end()
  }
}, 60000)

test('rejects owner reuse and mismatched database targets', () => {
  const owner = 'postgres://owner:long_password_here@localhost/db'
  expect(() => configuration({ DATABASE_URL: owner, MIGRATION_DATABASE_URL: owner })).toThrow()
  expect(() =>
    configuration({
      DATABASE_URL: 'postgres://runtime:long_password_here@localhost/other',
      MIGRATION_DATABASE_URL: owner,
    }),
  ).toThrow()
})
