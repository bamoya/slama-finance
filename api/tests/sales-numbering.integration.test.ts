import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import * as tables from '../db/schema/index.js'
// @ts-expect-error -- untyped JavaScript deployment initializer, exercised as shipped.
import { runtimeGrantStatements } from '../scripts/initialize-database.mjs'
import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/env.js'
import type { ObjectStorage } from '../src/integrations/contracts.js'
import { createPasswordService } from '../src/modules/organization/identity/auth/services/password.service.js'
import { nextDocumentNumber } from '../src/modules/organization/sales/shared/repositories/document-number.js'
import { attachTestDatabase, isolatedDatabase, testUserId } from './helpers/postgres.js'

const headers = {
  origin: 'http://localhost:5173',
  'x-organization-id': '10000000-0000-4000-8000-000000000001',
}
const clientId = '33333333-3333-4333-8333-333333333333'
const orgA = '10000000-0000-4000-8000-000000000001'

describe('Gap-free sales numbering and issued-document immutability', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let app: Awaited<ReturnType<typeof buildApp>>
  let cookies: { slama_session: string }

  beforeEach(async () => {
    fixture = await isolatedDatabase()
    await fixture.client`update company_settings set legal_name='Slama Agricole', address_line1='Rue Atlas', city='Casablanca', legal_type='auto_entrepreneur', ice='001122334455667' where id=1`
    await fixture.client`insert into clients (id,type,legal_name,address_line1,city) values (${clientId},'company','Atlas SARL','Rue Hassan','Rabat')`
    const hash = await createPasswordService().hash('numbering-password-123')
    await fixture.client`update users set password_hash=${hash} where id=${testUserId}`
    await fixture.client`insert into user_roles (user_id,role_id) select ${testUserId},id from roles where key='admin'`
    const storage: ObjectStorage = {
      async putImmutable(input) {
        return {
          key: input.key,
          contentType: input.contentType,
          byteSize: input.bytes.length,
          sha256: 'x',
        }
      },
      async get() {
        throw new Error('Not used')
      },
      async deleteUnreferenced() {},
      async signedDownloadUrl() {
        throw new Error('Not used')
      },
      async list() {
        return []
      },
    }
    app = await buildApp({
      environment: loadEnvironment({ NODE_ENV: 'test' }),
      logger: false,
      mediaStorage: storage,
    })
    attachTestDatabase(app, fixture)
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers,
      payload: { email: 'operator@example.test', password: 'numbering-password-123' },
    })
    cookies = { slama_session: login.cookies[0]!.value }
  })
  afterEach(async () => {
    await app?.close()
    await fixture?.cleanup()
  })
  const post = (url: string, payload: object) =>
    app.inject({ method: 'POST', url, headers, cookies, payload })
  const lineInput = {
    productVariantId: null,
    productName: 'Wheat',
    quantity: 2,
    unitPrice: '50.00',
    vatRate: null,
  }
  const documentInput = {
    clientId,
    templateId: null,
    issueDate: '2026-10-02',
    notes: 'n',
    paymentTerms: 'Cash',
    lines: [lineInput],
  }
  async function draftInvoice() {
    const created = await post('/api/v1/invoices', { ...documentInput, dueDate: null })
    expect(created.statusCode, created.body).toBe(201)
    return created.json() as { id: string; version: number }
  }
  async function issuedInvoice() {
    const draft = await draftInvoice()
    const issued = await post(`/api/v1/invoices/${draft.id}/issue`, { expectedVersion: 1 })
    expect(issued.statusCode, issued.body).toBe(200)
    return issued.json() as { id: string; number: string }
  }
  const nextIn = (series: 'FAC' | 'DEV' | 'BL' | 'PAY', timezone = 'Africa/Casablanca') =>
    fixture.db.transaction((tx) => nextDocumentNumber(tx, series, timezone))
  const suffix = (number: string) => Number(number.split('-')[2])

  it('numbers concurrent issuance gap-free, in issue order, with the PREFIX-YYYY-NNNNNN format', async () => {
    const drafts = await Promise.all(Array.from({ length: 8 }, draftInvoice))
    const results = await Promise.all(
      drafts.map((d) => post(`/api/v1/invoices/${d.id}/issue`, { expectedVersion: 1 })),
    )
    for (const r of results) expect(r.statusCode, r.body).toBe(200)
    const rows = await fixture.client<
      { number: string; issued_at: Date }[]
    >`select number, issued_at from invoices order by number`
    const year = new Intl.DateTimeFormat('en', {
      year: 'numeric',
      timeZone: 'Africa/Casablanca',
    }).format(new Date())
    expect(rows.map((r) => r.number)).toEqual(
      Array.from({ length: 8 }, (_, i) => `FAC-${year}-${String(i + 1).padStart(6, '0')}`),
    )
    for (let i = 1; i < rows.length; i++)
      expect(new Date(rows[i]!.issued_at).getTime()).toBeGreaterThanOrEqual(
        new Date(rows[i - 1]!.issued_at).getTime(),
      )
  })

  it('numbers estimates, delivery notes and payments in their own series', async () => {
    const estimate = (
      await post('/api/v1/estimates', { ...documentInput, validUntil: '2026-10-20' })
    ).json()
    const issuedEstimate = await post(`/api/v1/estimates/${estimate.id}/issue`, {
      expectedVersion: estimate.version,
    })
    expect(issuedEstimate.json().number).toMatch(/^DEV-\d{4}-000001$/)
    const invoice = await issuedInvoice()
    expect(invoice.number).toMatch(/^FAC-\d{4}-000001$/)
    const note = (await post(`/api/v1/invoices/${invoice.id}/delivery-note`, {})).json()
    const delivered = await post(`/api/v1/delivery-notes/${note.id}/deliver`, {
      expectedVersion: note.version,
    })
    expect(delivered.json().number).toMatch(/^BL-\d{4}-000001$/)
    const payment = await post('/api/v1/payments', {
      operationId: randomUUID(),
      invoiceId: invoice.id,
      amount: '10.00',
      currency: 'MAD',
      method: 'cash',
      status: 'confirmed',
      paymentDate: '2026-10-02',
      collectedOn: '2026-10-02',
      bankAccountId: null,
      reference: null,
      chequeBank: null,
      chequeNumber: null,
    })
    expect(payment.statusCode, payment.body).toBe(201)
    expect(payment.json().receiptNumber).toMatch(/^REC-\d{4}-000001$/)
    const [stored] = await fixture.client`select number from payments`
    expect(stored!.number).toMatch(/^PAY-\d{4}-000001$/)
  })

  it('leaves no gap when the issuing transaction rolls back', async () => {
    expect((await nextIn('FAC')).number).toMatch(/-000001$/)
    await expect(
      fixture.db.transaction(async (tx) => {
        await nextDocumentNumber(tx, 'FAC', 'Africa/Casablanca')
        throw new Error('rollback')
      }),
    ).rejects.toThrow('rollback')
    expect((await nextIn('FAC')).number).toMatch(/-000002$/)
    const failedIssue = await post('/api/v1/invoices/00000000-0000-4000-8000-00000000dead/issue', {
      expectedVersion: 1,
    })
    expect(failedIssue.statusCode).toBe(404)
    expect((await nextIn('FAC')).number).toMatch(/-000003$/)
  })

  it('serializes concurrent allocations without duplicates or gaps and grows beyond six digits', async () => {
    const numbers = await Promise.all(Array.from({ length: 12 }, () => nextIn('DEV')))
    expect(numbers.map((n) => suffix(n.number)).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 12 }, (_, i) => i + 1),
    )
    const year = new Intl.DateTimeFormat('en', {
      year: 'numeric',
      timeZone: 'Africa/Casablanca',
    }).format(new Date())
    await fixture.client`insert into document_number_counters (series,year,last) values ('BL',${Number(year)},999999)`
    expect((await nextIn('BL')).number).toBe(`BL-${year}-1000000`)
  })

  it('keeps organizations independent', async () => {
    const otherOwner = randomUUID()
    const otherOrg = randomUUID()
    await fixture.client`insert into platform_users (id,email,password_hash) values (${otherOwner},'other-owner@example.test','x')`
    await fixture.client`insert into organizations(id,owner_id,name,slug,activated_at) values (${otherOrg},${otherOwner},'Other','other',now())`
    await nextIn('FAC')
    await nextIn('FAC')
    const other = await fixture.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.organization_id', ${otherOrg}, true)`)
      return nextDocumentNumber(tx, 'FAC', 'Africa/Casablanca')
    })
    expect(other.number).toMatch(/-000001$/)
    expect((await nextIn('FAC')).number).toMatch(/-000003$/)
    const rows = await fixture.client`select organization_id from document_number_counters`
    expect(rows.map((r) => r.organization_id).sort()).toEqual([orgA, otherOrg].sort())
  })

  it('starts each calendar year of the company timezone at 1 and keeps earlier years', async () => {
    const year = (timezone: string) =>
      Number(
        new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: timezone }).format(new Date()),
      )
    await fixture.client`insert into document_number_counters (series,year,last) values ('FAC',${year('Africa/Casablanca') - 1},41)`
    const first = await nextIn('FAC')
    expect(first.number).toBe(`FAC-${year('Africa/Casablanca')}-000001`)
    for (const timezone of ['Pacific/Kiritimati', 'Pacific/Pago_Pago'])
      expect((await nextIn('BL', timezone)).number).toContain(`BL-${year(timezone)}-`)
    const [old] =
      await fixture.client`select last from document_number_counters where series='FAC' and year=${year('Africa/Casablanca') - 1}`
    expect(old!.last).toBe(41)
  })

  it('refuses to rewind or delete a counter', async () => {
    await nextIn('FAC')
    await nextIn('FAC')
    await expect(fixture.client`update document_number_counters set last=1`).rejects.toThrow(
      /advance by one/,
    )
    await expect(fixture.client`delete from document_number_counters`).rejects.toThrow(
      /cannot be deleted/,
    )
    // Only the transaction-local teardown flag (never set by product code) lifts the refusal.
    await fixture.client.begin(async (tx) => {
      await tx`select set_config('app.sales_teardown','on',true)`
      await tx`delete from document_number_counters`
    })
    expect(await fixture.client`select 1 from document_number_counters`).toHaveLength(0)
  })

  it('pins search_path on every sales integrity trigger function', async () => {
    const unpinned = await fixture.client`
      select p.proname from pg_proc p where p.pronamespace = current_schema()::regnamespace
        and p.proname in ('reject_issued_document_change_field','sales_teardown_enabled','guard_document_status','guard_issued_invoice','guard_issued_estimate','guard_issued_delivery_note','guard_payment','guard_issued_document_lines','guard_document_number_counter','guard_numbered_document_delete')
        and not coalesce(p.proconfig::text like '%search_path=pg_catalog, pg_temp%', false)`
    expect(unpinned).toEqual([])
  })

  async function asRuntime<T>(work: (runtime: postgres.Sql) => Promise<T>) {
    const schema = (
      await fixture.client<{ schema: string }[]>`select current_schema() as schema`
    )[0]!.schema
    for (const statement of runtimeGrantStatements(`"${fixture.role}"`, `"${schema}"`))
      await fixture.client.unsafe(statement)
    const runtime = postgres(process.env.TEST_DATABASE_URL!, {
      max: 2,
      connection: {
        search_path: `${schema},pg_catalog`,
        role: fixture.role,
        'app.organization_id': orgA,
      },
      onnotice: () => {},
    })
    try {
      return await work(runtime)
    } finally {
      await runtime.end({ timeout: 2 })
    }
  }

  it('refuses to hard-delete numbered documents and payments under the restricted role, but deletes drafts', async () => {
    const issued = await issuedInvoice()
    const draft = await draftInvoice()
    const estimate = (
      await post('/api/v1/estimates', { ...documentInput, validUntil: '2026-10-20' })
    ).json()
    await post(`/api/v1/estimates/${estimate.id}/issue`, { expectedVersion: estimate.version })
    const draftNote = (await post(`/api/v1/invoices/${issued.id}/delivery-note`, {})).json()
    const paid = await post('/api/v1/payments', {
      operationId: randomUUID(),
      invoiceId: issued.id,
      amount: '10.00',
      currency: 'MAD',
      method: 'cash',
      status: 'confirmed',
      paymentDate: '2026-10-02',
      collectedOn: '2026-10-02',
      bankAccountId: null,
      reference: null,
      chequeBank: null,
      chequeNumber: null,
    })
    expect(paid.statusCode, paid.body).toBe(201)
    const deliveredNote = await post(`/api/v1/delivery-notes/${draftNote.id}/deliver`, {
      expectedVersion: draftNote.version,
    })
    expect(deliveredNote.statusCode, deliveredNote.body).toBe(200)
    await asRuntime(async (runtime) => {
      for (const attempt of [
        runtime`delete from invoices where id=${issued.id}`,
        runtime`delete from estimates where id=${estimate.id}`,
        runtime`delete from delivery_notes where id=${draftNote.id}`,
        runtime`delete from payments where id=${paid.json().id}`,
      ])
        await expect(attempt).rejects.toThrow(/cannot be deleted/)
      // Cancelling does not make a number deletable either.
      await post(`/api/v1/invoices/${issued.id}/cancel`, { expectedVersion: 2, reason: 'x' })
      await expect(runtime`delete from invoices where id=${issued.id}`).rejects.toThrow(
        /cannot be deleted|violates/,
      )
      await runtime`delete from invoices where id=${draft.id}`
    })
    expect(await fixture.client`select 1 from invoices where id=${draft.id}`).toHaveLength(0)
    expect(await fixture.client`select 1 from invoices where id=${issued.id}`).toHaveLength(1)
    expect(await fixture.client`select 1 from payments`).toHaveLength(1)
    // The reserved teardown flag is the only way through.
    await fixture.client.begin(async (tx) => {
      await tx`select set_config('app.sales_teardown','on',true)`
      await tx`delete from payments`
      await tx`delete from delivery_notes`
      await tx`delete from estimates`
    })
    expect(await fixture.client`select 1 from payments`).toHaveLength(0)
  })

  it('makes cancelled terminal and never moves a status backwards', async () => {
    const issued = await issuedInvoice()
    await expect(
      fixture.client`update invoices set status='draft' where id=${issued.id}`,
    ).rejects.toThrow(/immutable/)
    await fixture.client`update invoices set status='sent', sent_at=now() where id=${issued.id}`
    await expect(
      fixture.client`update invoices set status='issued' where id=${issued.id}`,
    ).rejects.toThrow(/immutable/)
    const cancelled = await post(`/api/v1/invoices/${issued.id}/cancel`, {
      expectedVersion: 2,
      reason: 'Test',
    })
    expect(cancelled.statusCode, cancelled.body).toBe(200)
    for (const attempt of [
      fixture.client`update invoices set status='issued' where id=${issued.id}`,
      fixture.client`update invoices set status='sent' where id=${issued.id}`,
      fixture.client`update invoices set cancellation_reason='Other' where id=${issued.id}`,
      fixture.client`update invoices set cancelled_at=null where id=${issued.id}`,
    ])
      await expect(attempt).rejects.toThrow(/immutable/)
    // Other lifecycle fields (detached references, design) still change on a cancelled document.
    await fixture.client`update invoices set client_id=null where id=${issued.id}`
    const estimate = (
      await post('/api/v1/estimates', { ...documentInput, validUntil: '2026-10-20' })
    ).json()
    const issuedEstimate = await post(`/api/v1/estimates/${estimate.id}/issue`, {
      expectedVersion: estimate.version,
    })
    const cancelledEstimate = await post(`/api/v1/estimates/${estimate.id}/cancel`, {
      expectedVersion: issuedEstimate.json().version,
      reason: 'Test',
    })
    expect(cancelledEstimate.statusCode, cancelledEstimate.body).toBe(200)
    await expect(
      fixture.client`update estimates set status='issued' where id=${estimate.id}`,
    ).rejects.toThrow(/immutable/)
  })

  it('allocates numbers under the restricted runtime role grants', async () => {
    const schema = (
      await fixture.client<{ schema: string }[]>`select current_schema() as schema`
    )[0]!.schema
    for (const statement of runtimeGrantStatements(`"${fixture.role}"`, `"${schema}"`))
      await fixture.client.unsafe(statement)
    const runtime = postgres(process.env.TEST_DATABASE_URL!, {
      max: 2,
      connection: {
        search_path: `${schema},pg_catalog`,
        role: fixture.role,
        'app.organization_id': orgA,
      },
      onnotice: () => {},
    })
    try {
      const db = drizzle(runtime, { schema: tables })
      const a = await db.transaction((tx) => nextDocumentNumber(tx, 'PAY', 'Africa/Casablanca'))
      const b = await db.transaction((tx) => nextDocumentNumber(tx, 'PAY', 'Africa/Casablanca'))
      expect([suffix(a.number), suffix(b.number)]).toEqual([1, 2])
      await expect(runtime`delete from document_number_counters`).rejects.toThrow(
        /permission denied/,
      )
    } finally {
      await runtime.end({ timeout: 2 })
    }
  })

  it('freezes issued invoice identity, number and amounts but allows lifecycle changes', async () => {
    const draft = await draftInvoice()
    // Drafts stay editable at database level.
    await fixture.client`update invoices set notes='edited draft', client_snapshot=jsonb_set(client_snapshot,'{legalName}','"Draft edit"') where id=${draft.id}`
    const issued = await post(`/api/v1/invoices/${draft.id}/issue`, { expectedVersion: 1 })
    expect(issued.statusCode, issued.body).toBe(200)
    const id = draft.id
    const refused = [
      fixture.client`update invoices set number='FAC-2026-999999' where id=${id}`,
      fixture.client`update invoices set issued_at=now()+interval '1 day' where id=${id}`,
      fixture.client`update invoices set issuer_snapshot='{}'::jsonb where id=${id}`,
      fixture.client`update invoices set client_snapshot='{}'::jsonb where id=${id}`,
      fixture.client`update invoices set bank_details_snapshot='{}'::jsonb where id=${id}`,
      fixture.client`update invoices set subtotal=1, total=1 where id=${id}`,
      fixture.client`update invoice_lines set quantity=9 where invoice_id=${id}`,
      fixture.client`delete from invoice_lines where invoice_id=${id}`,
      fixture.client`insert into invoice_lines (invoice_id,position,product_name,quantity,unit_price,net_amount,tax_amount,total_amount) values (${id},5,'x',1,1,1,0,1)`,
    ]
    for (const attempt of refused) await expect(attempt).rejects.toThrow(/immutable/)
    // Legitimate lifecycle and reference changes still work.
    await fixture.client`update invoices set status='sent', sent_at=now(), version=version+1, content_version=content_version+1, template_id=null, appearance_snapshot='{"layout":"classic"}'::jsonb where id=${id}`
    await fixture.client`update invoice_lines set product_id=null, product_variant_id=null where invoice_id=${id}`
    await fixture.client`update invoices set client_id=null, bank_account_id=null where id=${id}`
    const cancelled = await post(`/api/v1/invoices/${id}/cancel`, {
      expectedVersion: 3,
      reason: 'Test',
    })
    expect(cancelled.statusCode, cancelled.body).toBe(200)
    const [row] = await fixture.client`select status, number from invoices where id=${id}`
    expect(row).toMatchObject({ status: 'cancelled', number: issued.json().number })
  })

  it('freezes issued estimates and delivered delivery notes', async () => {
    const estimate = (
      await post('/api/v1/estimates', { ...documentInput, validUntil: '2026-10-20' })
    ).json()
    const issued = await post(`/api/v1/estimates/${estimate.id}/issue`, {
      expectedVersion: estimate.version,
    })
    expect(issued.statusCode, issued.body).toBe(200)
    await expect(
      fixture.client`update estimates set client_snapshot='{}'::jsonb where id=${estimate.id}`,
    ).rejects.toThrow(/immutable/)
    await expect(
      fixture.client`update estimates set number='DEV-1' where id=${estimate.id}`,
    ).rejects.toThrow(/immutable/)
    await expect(
      fixture.client`update estimate_lines set unit_price=1 where estimate_id=${estimate.id}`,
    ).rejects.toThrow(/immutable/)
    const accepted = await post(`/api/v1/estimates/${estimate.id}/accept`, {
      expectedVersion: issued.json().version,
    })
    expect(accepted.statusCode, accepted.body).toBe(200)

    const invoice = await issuedInvoice()
    const note = (await post(`/api/v1/invoices/${invoice.id}/delivery-note`, {})).json()
    await fixture.client`update delivery_notes set delivery_address='draft edit' where id=${note.id}`
    const delivered = await post(`/api/v1/delivery-notes/${note.id}/deliver`, {
      expectedVersion: note.version,
    })
    expect(delivered.statusCode, delivered.body).toBe(200)
    await expect(
      fixture.client`update delivery_notes set number='BL-1' where id=${note.id}`,
    ).rejects.toThrow(/immutable/)
    await expect(
      fixture.client`update delivery_notes set issuer_snapshot='{}'::jsonb where id=${note.id}`,
    ).rejects.toThrow(/immutable/)
    await expect(
      fixture.client`update delivery_note_lines set quantity=99 where delivery_note_id=${note.id}`,
    ).rejects.toThrow(/immutable/)
    const cancelled = await post(`/api/v1/delivery-notes/${note.id}/cancel`, {
      expectedVersion: delivered.json().version,
      reason: 'Test',
    })
    expect(cancelled.statusCode, cancelled.body).toBe(200)
  })

  it('freezes payment identity and receipt snapshot while status transitions work', async () => {
    const invoice = await issuedInvoice()
    const created = await post('/api/v1/payments', {
      operationId: randomUUID(),
      invoiceId: invoice.id,
      amount: '10.00',
      currency: 'MAD',
      method: 'cash',
      status: 'confirmed',
      paymentDate: '2026-10-02',
      collectedOn: '2026-10-02',
      bankAccountId: null,
      reference: null,
      chequeBank: null,
      chequeNumber: null,
    })
    expect(created.statusCode, created.body).toBe(201)
    const id = created.json().id
    for (const attempt of [
      fixture.client`update payments set number='PAY-2026-999999' where id=${id}`,
      fixture.client`update payments set amount=99 where id=${id}`,
      fixture.client`update payments set receipt_snapshot=jsonb_set(receipt_snapshot,'{issuer,legalName}','"Other"') where id=${id}`,
      fixture.client`update payments set receipt_snapshot=null where id=${id}`,
    ])
      await expect(attempt).rejects.toThrow(/immutable/)
    // Design change at regeneration is allowed.
    await fixture.client`update payments set receipt_snapshot=jsonb_set(receipt_snapshot,'{appearance}','{"layout":"classic"}'::jsonb) where id=${id}`
    const cancelled = await post(`/api/v1/payments/${id}/cancel`, {
      expectedVersion: created.json().version,
      reason: 'Test',
    })
    expect(cancelled.statusCode, cancelled.body).toBe(200)
  })
})
