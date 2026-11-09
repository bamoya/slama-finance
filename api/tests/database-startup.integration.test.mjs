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
    }
    owner = postgres(ownerUrl, { max: 1, onnotice: () => {} })
    const attempts = await Promise.allSettled([initializeDatabase(env), initializeDatabase(env)])
    for (const attempt of attempts) if (attempt.status === 'rejected') throw attempt.reason
    const before = await owner`SELECT count(*) FROM drizzle.__drizzle_migrations`
    expect(Number(before[0].count)).toBeGreaterThan(0)
    expect((await owner`SELECT count(*) FROM public.users`)[0].count).toBe('0')
    expect((await owner`SELECT count(*) FROM public.platform_users`)[0].count).toBe('0')
    await initializeDatabase(env)
    expect(await owner`SELECT count(*) FROM drizzle.__drizzle_migrations`).toEqual(before)
    expect((await owner`SELECT count(*) FROM products`)[0].count).toBe('0')
    // A fresh installation must contain no demonstration business records.
    for (const table of [
      'product_categories',
      'product_variants',
      'clients',
      'estimates',
      'invoices',
      'payments',
      'delivery_notes',
      'bank_accounts',
      'document_templates',
    ]) {
      expect((await owner.unsafe('SELECT count(*) FROM public.' + table))[0].count).toBe('0')
    }
    expect(await owner`SELECT legal_name FROM company_settings`).toHaveLength(0)
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
    // Exercise the initializer's real grants, not synthetic fixture permissions.
    await runtime.begin(async (tx) => {
      await tx`select set_config('app.actor_type','owner',true)`
      for (const [table, count] of [
        ['entitlement_definitions', 11],
        ['plan_versions', 4],
        ['plan_entitlements', 44],
        ['plan_version_prices', 6],
      ]) {
        expect(Number((await tx.unsafe(`select count(*) n from public.${table}`))[0].n)).toBe(count)
        const [privilege] =
          await tx`select has_table_privilege(current_user,${'public.' + table},'INSERT,UPDATE,DELETE,TRUNCATE') writable`
        expect(privilege.writable).toBe(false)
      }
    })
    await expect(
      runtime`insert into public.plan_versions(plan_code,version_number,display_name,rank) values ('business',2,'Forbidden draft',2)`,
    ).rejects.toThrow(/permission denied/)
    await expect(runtime`update public.plan_versions set display_name='Forbidden'`).rejects.toThrow(
      /permission denied/,
    )
    await expect(runtime`delete from public.plan_version_prices`).rejects.toThrow(
      /permission denied/,
    )
    // S5b coverage writers: insert-only rows, supersession/status columns, controlled shift function.
    const [periods] = await runtime`select
      has_table_privilege(current_user,'public.subscription_periods','SELECT,INSERT') period_insert,
      has_table_privilege(current_user,'public.subscription_periods','DELETE,TRUNCATE') period_delete,
      has_column_privilege(current_user,'public.subscription_periods','superseded_at','UPDATE') superseded,
      has_column_privilege(current_user,'public.subscription_periods','ends_at','UPDATE') window_update,
      has_table_privilege(current_user,'public.subscription_period_notes','INSERT') note_insert,
      has_table_privilege(current_user,'public.subscription_period_notes','UPDATE,DELETE,TRUNCATE') note_change,
      has_table_privilege(current_user,'public.subscription_suspensions','INSERT') suspension_insert,
      has_table_privilege(current_user,'public.subscription_suspensions','UPDATE,DELETE,TRUNCATE') suspension_change,
      has_column_privilege(current_user,'public.subscription_scheduled_changes','status','UPDATE') change_status,
      has_column_privilege(current_user,'public.subscription_scheduled_changes','effective_at','UPDATE') change_effective,
      has_function_privilege(current_user,'public.subscription_periods_shift(uuid,timestamptz,bigint)','EXECUTE') shift,
      has_function_privilege(current_user,'public.subscription_periods_reconcile(text)','EXECUTE') reconcile,
      has_function_privilege(current_user,'public.mirror_subscription_trial()','EXECUTE') mirror`
    expect(periods).toEqual({
      period_insert: true,
      period_delete: false,
      superseded: true,
      window_update: false,
      note_insert: true,
      note_change: false,
      suspension_insert: true,
      suspension_change: false,
      change_status: true,
      change_effective: false,
      shift: true,
      reconcile: false,
      mirror: false,
    })
    // The shift function refuses outside an administrator transaction.
    await expect(
      runtime`select public.subscription_periods_shift(gen_random_uuid(), now(), 0)`,
    ).rejects.toThrow(/Platform administrator context required/)
    // Override history: append-only through grants, administrator-only through RLS.
    const [columns] = await runtime`select
      has_column_privilege(current_user,'public.subscription_overrides','revoked_at','UPDATE') revoked_at,
      has_column_privilege(current_user,'public.subscription_overrides','integer_value','UPDATE') integer_value,
      has_column_privilege(current_user,'public.subscription_overrides','starts_at','UPDATE') starts_at,
      has_column_privilege(current_user,'public.subscription_overrides','ends_at','UPDATE') ends_at,
      has_column_privilege(current_user,'public.subscription_overrides','owner_id','UPDATE') owner_id,
      has_column_privilege(current_user,'public.subscription_override_notes','revoked_by','UPDATE') revoked_by,
      has_column_privilege(current_user,'public.subscription_override_notes','revocation_reason','UPDATE') revocation_reason,
      has_column_privilege(current_user,'public.subscription_override_notes','reason','UPDATE') reason,
      has_column_privilege(current_user,'public.subscription_override_notes','created_by','UPDATE') created_by,
      has_table_privilege(current_user,'public.subscription_overrides','DELETE') override_delete,
      has_table_privilege(current_user,'public.subscription_override_notes','DELETE') note_delete,
      has_table_privilege(current_user,'public.subscription_overrides','TRUNCATE') override_truncate`
    expect(columns).toEqual({
      revoked_at: true,
      integer_value: false,
      starts_at: false,
      ends_at: false,
      owner_id: false,
      revoked_by: true,
      revocation_reason: true,
      reason: false,
      created_by: false,
      override_delete: false,
      note_delete: false,
      override_truncate: false,
    })
    await expect(runtime`update public.subscription_overrides set integer_value=1`).rejects.toThrow(
      /permission denied/,
    )
    await expect(runtime`update public.subscription_override_notes set reason='x'`).rejects.toThrow(
      /permission denied/,
    )
    await expect(runtime`delete from public.subscription_overrides`).rejects.toThrow(
      /permission denied/,
    )
    await expect(runtime`truncate public.subscription_overrides`).rejects.toThrow(
      /permission denied/,
    )
    for (const actor of ['owner', 'worker', ''])
      await expect(
        runtime.begin(async (tx) => {
          await tx`select set_config('app.actor_type',${actor},true),set_config('app.owner_id','10000000-0000-4000-8000-000000000002',true)`
          await tx`insert into public.subscription_overrides(owner_id,entitlement_key,value_type,boolean_value,starts_at) values ('10000000-0000-4000-8000-000000000002','staff_roles','boolean',true,now())`
        }),
      ).rejects.toThrow(/row-level security/)
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
