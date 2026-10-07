import { expect, it } from 'vitest'

import { isolatedDatabase } from './helpers/postgres.js'

it('consolidates old reporting grants without removing access from existing roles', async () => {
  const fixture = await isolatedDatabase(async (name, sql) => {
    if (name !== '0020_single_report_permission.sql') return
    await sql`insert into roles (key, name) values ('old-report-recipient', 'Legacy recipient'), ('no-report-access', 'No reports')`
    await sql`insert into role_permissions (role_id, permission_id)
      select r.id,p.id from roles r cross join permissions p
      where r.key='old-report-recipient' and p.key in ('reports.sections.collections','report_runs.read')`
  })
  try {
    const keys =
      await fixture.client`select key from permissions where key like 'reports.%' or key like 'report_schedules.%' or key like 'report_runs.%'`
    expect(keys.map((row) => row.key)).toEqual(['reports.read'])
    const granted =
      await fixture.client`select r.key from roles r join role_permissions rp on rp.role_id=r.id join permissions p on p.id=rp.permission_id where p.key='reports.read'`
    expect(granted.map((row) => row.key)).toContain('old-report-recipient')
    expect(granted.map((row) => row.key)).not.toContain('no-report-access')
  } finally {
    await fixture.cleanup()
  }
})
