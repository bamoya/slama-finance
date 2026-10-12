import { expect, it } from 'vitest'

import { isolatedDatabase } from './helpers/postgres.js'

it('migrates prepared BLs to delivered without changing their number or content', async () => {
  const fixture = await isolatedDatabase(async (name, client) => {
    if (name === '0031_mature_spacker_dave.sql') {
      await client`update delivery_notes set status='acknowledged',received_by_name='Legacy receiver',acknowledged_at='2026-10-02T12:00:00Z' where number='BL-LEGACY'`
      return
    }
    if (name !== '0030_yellow_eternals.sql') return
    const [customer] =
      await client`insert into clients(type,legal_name,address_line1,city) values('company','Migration customer','Rue Atlas','Rabat') returning id`
    await client`insert into delivery_notes(number,client_id,status,delivery_date,issuer_snapshot,client_snapshot,delivery_address,updated_at) values('BL-LEGACY',${customer!.id},'prepared','2026-10-01','{}','{}','Rue Atlas','2026-10-01T12:00:00Z')`
  })
  try {
    const [row] =
      await fixture.client`select status,number,version,content_version,delivered_at,received_by_name from delivery_notes where number='BL-LEGACY'`
    expect(row).toMatchObject({
      status: 'delivered',
      number: 'BL-LEGACY',
      version: 3,
      content_version: 1,
      received_by_name: 'Legacy receiver',
    })
    expect(new Date(row!.delivered_at).toISOString()).toBe('2026-10-01T12:00:00.000Z')
  } finally {
    await fixture.cleanup()
  }
})
