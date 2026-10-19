import { expect, it } from 'vitest'

import { isolatedDatabase } from './helpers/postgres.js'

it('installs the final schema and only required defaults on a fresh database', async () => {
  const fixture = await isolatedDatabase()
  try {
    const permissions = await fixture.client`select key from permissions order by key`
    expect(permissions).toHaveLength(53)
    expect(permissions.every((p) => /^[a-z_]+\.(read|create|update|delete)$/.test(p.key))).toBe(
      true,
    )
    expect(permissions.filter((p) => p.key.startsWith('reports.')).map((p) => p.key)).toEqual([
      'reports.read',
    ])
    expect(permissions.map((p) => p.key)).toContain('staff.delete')
    const admin =
      await fixture.client`select p.key from permissions p join role_permissions rp on rp.permission_id=p.id join roles r on r.id=rp.role_id where r.key='admin' order by p.key`
    expect(admin).toEqual(permissions)
    expect(await fixture.client`select key,is_system from roles`).toEqual([
      { key: 'admin', is_system: true },
    ])
    const [company] =
      await fixture.client`select legal_name,locale,currency,timezone from company_settings where id=1`
    expect(company).toEqual({
      legal_name: null,
      locale: 'fr-MA',
      currency: 'MAD',
      timezone: 'Africa/Casablanca',
    })
    for (const table of [
      'products',
      'product_categories',
      'clients',
      'estimates',
      'invoices',
      'payments',
      'delivery_notes',
    ])
      expect((await fixture.client.unsafe(`select count(*) from ${table}`))[0]!.count).toBe('0')
    const [constraint] =
      await fixture.client`select pg_get_constraintdef(oid) as definition from pg_constraint where conname='delivery_notes_status' and connamespace=(select oid from pg_namespace where nspname=current_schema())`
    expect(constraint!.definition).toContain('delivered')
    expect(constraint!.definition).not.toContain('prepared')
    expect(constraint!.definition).not.toContain('acknowledged')
    const triggers =
      await fixture.client`select tgname from pg_trigger where tgrelid in (select oid from pg_class where relnamespace=(select oid from pg_namespace where nspname=current_schema())) and not tgisinternal order by tgname`
    expect(triggers.map((row) => row.tgname)).toEqual([
      'delivery_invoice_owner_after_allocation',
      'delivery_invoice_owner_after_delivery_line',
      'delivery_invoice_owner_after_invoice_line',
      'delivery_invoice_owner_after_note',
      'product_requires_variant_after_change',
      'product_requires_variant_after_create',
      'product_variant_parent_lock',
    ])
  } finally {
    await fixture.cleanup()
  }
})
