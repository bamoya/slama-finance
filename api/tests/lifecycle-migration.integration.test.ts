import { randomUUID } from 'node:crypto'
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { readMigrationFiles } from 'drizzle-orm/migrator'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { isolatedDatabase } from './helpers/postgres.js'

const sourceMigrationsFolder = fileURLToPath(new URL('../db/migrations/', import.meta.url))
describe('deployed baseline lifecycle upgrade', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let schema: string
  let migrationsFolder: string
  beforeEach(async () => {
    fixture = await isolatedDatabase({ migrationCount: 2 })
    schema = (await fixture.client`select current_schema() as name`)[0]!.name
    // Isolate explicit public-schema FK declarations just like the SQL fixture
    // helper does, without modifying the actual deployed migration files.
    migrationsFolder = await mkdtemp(join(tmpdir(), 'slama-migration-upgrade-'))
    await cp(sourceMigrationsFolder, migrationsFolder, { recursive: true })
    for (const file of (await readdir(migrationsFolder)).filter((file) => file.endsWith('.sql'))) {
      const path = join(migrationsFolder, file)
      await writeFile(path, (await readFile(path, 'utf8')).replaceAll('"public".', `"${schema}".`))
    }
    // Model a real deployment: the original two migrations are already recorded.
    await fixture.client`create table __drizzle_migrations(id serial primary key, hash text not null, created_at bigint)`
    for (const migration of readMigrationFiles({ migrationsFolder }).slice(0, 2))
      await fixture.client`insert into __drizzle_migrations(hash,created_at) values(${migration.hash},${migration.folderMillis})`
  })
  afterEach(async () => {
    await fixture?.cleanup()
    if (migrationsFolder) await rm(migrationsFolder, { recursive: true, force: true })
  })
  const upgrade = () => migrate(fixture.db, { migrationsFolder, migrationsSchema: schema })
  it('upgrades existing clients without data loss and accepts sparse client details', async () => {
    const [old] =
      await fixture.client`insert into clients(type,legal_name,address_line1,city) values('company','Existing company','Rue Atlas','Rabat') returning *`
    await upgrade()
    expect((await fixture.client`select * from clients where id=${old!.id}`)[0]).toEqual(old)
    await fixture.client`update clients set address_line1=null,city=null,country_code=null,registration_number='123',registration_city=null where id=${old!.id}`
    const [sparse] =
      await fixture.client`insert into clients(type,last_name,delivery_city) values('individual','Amrani','Rabat') returning *`
    expect(sparse).toMatchObject({
      first_name: null,
      last_name: 'Amrani',
      address_line1: null,
      city: null,
      country_code: null,
      delivery_city: 'Rabat',
    })
    await upgrade()
    expect((await fixture.client`select * from clients where id=${sparse!.id}`)[0]).toEqual(sparse)
  })
  async function existingRecords(conflict = false) {
    const client = randomUUID(),
      estimate = randomUUID(),
      invoice = randomUUID(),
      note = randomUUID(),
      line = randomUUID(),
      noteLine = randomUUID(),
      bank = randomUUID(),
      payment = randomUUID()
    await fixture.client`insert into clients(id,type,legal_name,address_line1,city) values(${client},'company','Existing client','Rue Atlas','Rabat')`
    await fixture.client`insert into estimates(id,client_id,number,status,issue_date,valid_until,issued_at,issuer_snapshot,client_snapshot,appearance_snapshot) values(${estimate},${client},'DEV-EXISTING','issued','2026-10-01','2026-11-01',now(),'{}','{"legalName":"Frozen client"}','{"layout":"atelier"}')`
    await fixture.client`insert into invoices(id,client_id,source_estimate_id,conversion_operation_id,conversion_request,number,status,issue_date,due_date,issued_at,issuer_snapshot,client_snapshot,appearance_snapshot) values(${invoice},${client},${estimate},${randomUUID()},'{}','FAC-EXISTING','issued','2026-10-01','2026-11-01',now(),'{}','{"legalName":"Frozen client"}','{"layout":"atelier"}')`
    await fixture.client`insert into invoice_lines(id,invoice_id,position,product_name,quantity,unit_price,net_amount,tax_amount,total_amount) values(${line},${invoice},0,'Wheat',10,20,200,0,200)`
    await fixture.client`insert into delivery_notes(id,client_id,delivery_date,delivery_address,issuer_snapshot,client_snapshot) values(${note},${client},'2026-10-01','Rabat','{}','{}')`
    await fixture.client`insert into delivery_note_lines(id,delivery_note_id,source_invoice_line_id,position,product_name,quantity) values(${noteLine},${note},${line},0,'Wheat',10)`
    await fixture.client`insert into delivery_invoice_allocations(invoice_line_id,delivery_note_line_id,quantity) values(${line},${noteLine},5)`
    await fixture.client`insert into bank_accounts(id,name,bank_name,account_holder,rib) values(${bank},'Existing bank','Bank A','Slama','225091032701984651012213')`
    await fixture.client`insert into payments(id,number,operation_id,creation_request,receipt_snapshot,invoice_id,amount,currency,method,status,payment_date,collected_on,confirmed_at,bank_account_id) values(${payment},'PAY-EXISTING',${randomUUID()},'{"original":true}','{"frozen":true}',${invoice},'40.00','MAD','bank_transfer','confirmed','2026-10-01','2026-10-01',now(),${bank})`
    let extraLine: string | undefined
    if (conflict) {
      const extraInvoice = randomUUID()
      extraLine = randomUUID()
      await fixture.client`insert into invoices(id,client_id,issue_date,issuer_snapshot,client_snapshot,appearance_snapshot) values(${extraInvoice},${client},'2026-10-01','{}','{}','{}')`
      await fixture.client`insert into invoice_lines(id,invoice_id,position,product_name,quantity,unit_price,net_amount,tax_amount,total_amount) values(${extraLine},${extraInvoice},0,'Wheat',10,20,200,0,200)`
      await fixture.client`insert into delivery_invoice_allocations(invoice_line_id,delivery_note_line_id,quantity) values(${extraLine},${noteLine},5)`
    }
    return { client, estimate, invoice, note, line, noteLine, payment, bank, extraLine }
  }
  it('upgrades existing rows, backfills identity and provenance, and only applies once', async () => {
    const ids = await existingRecords()
    const before = (
      await fixture.client`select client_snapshot,appearance_snapshot,content_version from invoices where id=${ids.invoice}`
    )[0]!
    await upgrade()
    const [invoice] =
      await fixture.client`select client_snapshot,appearance_snapshot,content_version,source_estimate_number_snapshot from invoices where id=${ids.invoice}`
    expect(invoice).toMatchObject(before)
    expect(invoice!.source_estimate_number_snapshot).toBe('DEV-EXISTING')
    const [payment] =
      await fixture.client`select bank_account_snapshot,creation_request,receipt_snapshot,version,amount from payments where id=${ids.payment}`
    expect(payment).toMatchObject({
      bank_account_snapshot: { bankName: 'Bank A', accountHolder: 'Slama' },
      creation_request: { original: true },
      receipt_snapshot: { frozen: true },
      version: 1,
      amount: '40.00',
    })
    expect(
      (await fixture.client`select invoice_id from delivery_notes where id=${ids.note}`)[0]!
        .invoice_id,
    ).toBe(ids.invoice)
    expect(await fixture.client`select * from delivery_invoice_allocations`).toHaveLength(1)
    const journal =
      await fixture.client`select hash,created_at from __drizzle_migrations order by id`
    expect(journal).toHaveLength(readMigrationFiles({ migrationsFolder }).length)
    await upgrade()
    expect(
      await fixture.client`select hash,created_at from __drizzle_migrations order by id`,
    ).toEqual(journal)
    await fixture.client`update clients set legal_name='Changed' where id=${ids.client}`
    await fixture.client`update invoices set client_id=null where id=${ids.invoice}`
    await fixture.client`update delivery_notes set status='cancelled',cancellation_reason='Cancelled draft' where id=${ids.note}`
    const extraInvoice = randomUUID(),
      extraLine = randomUUID()
    await fixture.client`insert into invoices(id,client_id,issue_date,issuer_snapshot,client_snapshot,appearance_snapshot) values(${extraInvoice},${ids.client},'2026-10-01','{}','{}','{}')`
    await fixture.client`insert into invoice_lines(id,invoice_id,position,product_name,quantity,unit_price,net_amount,tax_amount,total_amount) values(${extraLine},${extraInvoice},0,'Wheat',10,20,200,0,200)`
    await expect(
      fixture.client`insert into delivery_invoice_allocations(invoice_line_id,delivery_note_line_id,quantity) values(${extraLine},${ids.noteLine},1)`,
    ).rejects.toThrow('only one invoice')
  })
  it('rolls back the complete upgrade on ambiguous legacy ownership, preserving records for explicit repair', async () => {
    const ids = await existingRecords(true)
    await expect(upgrade()).rejects.toThrow(
      'Migration blocked: delivery notes reference multiple invoices',
    )
    expect(await fixture.client`select * from delivery_invoice_allocations`).toHaveLength(2)
    expect(await fixture.client`select * from __drizzle_migrations`).toHaveLength(2)
    expect(
      await fixture.client`select column_name from information_schema.columns where table_schema=${schema} and column_name='source_estimate_number_snapshot'`,
    ).toHaveLength(0)
    expect(
      (
        await fixture.client`select is_nullable from information_schema.columns where table_schema=${schema} and table_name='invoices' and column_name='client_id'`
      )[0]!.is_nullable,
    ).toBe('NO')
    // Explicit fixture-only repair; production is never reconciled automatically.
    await fixture.client`delete from delivery_invoice_allocations where invoice_line_id=${ids.extraLine!}`
    await upgrade()
    expect(await fixture.client`select * from __drizzle_migrations`).toHaveLength(
      readMigrationFiles({ migrationsFolder }).length,
    )
    expect(
      (await fixture.client`select invoice_id from delivery_notes where id=${ids.note}`)[0]!
        .invoice_id,
    ).toBe(ids.invoice)
  })
  it('preserves historical Classic BL designs when upgrading the deployed 0002 schema', async () => {
    const migrations = readMigrationFiles({ migrationsFolder })
    await fixture.client.begin(async (tx) => {
      for (const statement of migrations[2]!.sql) if (statement.trim()) await tx.unsafe(statement)
      await tx`insert into __drizzle_migrations(hash,created_at) values(${migrations[2]!.hash},${migrations[2]!.folderMillis})`
    })
    const clientId = randomUUID(),
      noteId = randomUUID()
    await fixture.client`insert into clients(id,type,legal_name,address_line1,city) values(${clientId},'company','Legacy client','Rue Atlas','Rabat')`
    await fixture.client`insert into delivery_notes(id,number,status,client_id,delivery_date,delivery_address,issuer_snapshot,client_snapshot,delivered_at) values(${noteId},'BL-LEGACY','delivered',${clientId},'2026-10-01','Rabat','{"legalName":"Frozen company"}','{"legalName":"Frozen client"}',now())`
    const [template] =
      await fixture.client`insert into document_templates(name,layout,accent_color,footer_text) values('Current default','atelier','#176c51','Must not appear on old BL') returning id`
    await fixture.client`update company_settings set default_template_id=${template!.id} where id=1`
    const [before] =
      await fixture.client`select issuer_snapshot,client_snapshot,number,version,content_version from delivery_notes where id=${noteId}`
    await upgrade()
    const [after] =
      await fixture.client`select issuer_snapshot,client_snapshot,number,version,content_version,template_id,appearance_snapshot from delivery_notes where id=${noteId}`
    expect(after).toMatchObject(before!)
    expect(after!.template_id).toBeNull()
    expect(after!.appearance_snapshot).toEqual({
      layout: 'classic',
      density: 'standard',
      accentColor: '#ad7d1d',
    })
    const journal = await fixture.client`select * from __drizzle_migrations`
    await upgrade()
    expect(await fixture.client`select * from __drizzle_migrations`).toEqual(journal)
  })
})
