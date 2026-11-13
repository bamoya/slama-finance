import { randomUUID } from 'node:crypto'

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
import { createMediaModule } from '../src/modules/organization/media/index.js'
import { createSalesModule } from '../src/modules/organization/sales/index.js'
import { nextDocumentNumber } from '../src/modules/organization/sales/shared/repositories/document-number.js'
import { createOwnerFinancialSummaryRepository } from '../src/modules/platform/analytics/repositories/owner-financial-summary.repository.js'
import {
  attachTestDatabase,
  isolatedDatabase,
  testOwnerId,
  testUserId,
} from './helpers/postgres.js'

const orgA = '10000000-0000-4000-8000-000000000001'
const headers = { origin: 'http://localhost:5173', 'x-organization-id': orgA }
const clientId = '33333333-3333-4333-8333-333333333333'
const year = new Intl.DateTimeFormat('en', {
  year: 'numeric',
  timeZone: 'Africa/Casablanca',
}).format(new Date())

type Line = { id: string; productName: string }
type Invoice = { id: string; number: string; version: number; lines: Line[] }
const lineInput = (
  productName: string,
  quantity: number,
  unitPrice: string,
  vatRate: string | null,
) => ({
  productVariantId: null,
  productName,
  quantity,
  unitPrice,
  vatRate,
})

describe('Credit notes (avoirs)', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let app: Awaited<ReturnType<typeof buildApp>>
  let cookies: { slama_session: string }
  const files = new Map<string, Uint8Array>()
  const storage: ObjectStorage = {
    async putImmutable(input) {
      files.set(input.key, input.bytes)
      return {
        key: input.key,
        contentType: input.contentType,
        byteSize: input.bytes.length,
        sha256: 'x',
      }
    },
    async get(key) {
      const bytes = files.get(key)
      if (!bytes) throw new Error('missing')
      return bytes
    },
    async deleteUnreferenced() {},
    async signedDownloadUrl() {
      throw new Error('Not used')
    },
    async list() {
      return []
    },
  }

  beforeEach(async () => {
    files.clear()
    fixture = await isolatedDatabase()
    await fixture.client`update company_settings set legal_name='Slama Agricole', address_line1='Rue Atlas', city='Casablanca', legal_type='auto_entrepreneur', ice='001122334455667' where id=1`
    await fixture.client`insert into clients (id,type,legal_name,address_line1,city) values (${clientId},'company','Atlas SARL','Rue Hassan','Rabat')`
    const hash = await createPasswordService().hash('credit-notes-password-123')
    await fixture.client`update users set password_hash=${hash} where id=${testUserId}`
    await fixture.client`insert into user_roles (user_id,role_id) select ${testUserId},id from roles where key='admin'`
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
      payload: { email: 'operator@example.test', password: 'credit-notes-password-123' },
    })
    cookies = { slama_session: login.cookies[0]!.value }
  })
  afterEach(async () => {
    await app?.close()
    await fixture?.cleanup()
  })

  const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, headers, cookies, ...(payload ? { payload } : {}) })
  const post = (url: string, payload: object = {}) => call('POST', url, payload)

  async function issuedInvoice(
    lines = [lineInput('Wheat', 3, '100.00', '20.00'), lineInput('Barley', 1, '50.55', '10.00')],
    issueDate = '2026-09-15',
  ) {
    const created = await post('/api/v1/invoices', {
      clientId,
      templateId: null,
      issueDate,
      dueDate: null,
      notes: null,
      paymentTerms: null,
      lines,
    })
    expect(created.statusCode, created.body).toBe(201)
    const issued = await post(`/api/v1/invoices/${created.json().id}/issue`, {
      expectedVersion: 1,
    })
    expect(issued.statusCode, issued.body).toBe(200)
    return issued.json() as Invoice
  }
  const draftCredit = (
    invoice: Invoice,
    lines: { invoiceLineId: string; quantity?: number; amount?: string }[],
    reason = 'Returned goods',
  ) => post('/api/v1/credit-notes', { invoiceId: invoice.id, reason, lines })
  const issueCredit = (note: { id: string; version: number }) =>
    post(`/api/v1/credit-notes/${note.id}/issue`, { expectedVersion: note.version })
  async function credit(
    invoice: Invoice,
    lines: { invoiceLineId: string; quantity?: number; amount?: string }[],
  ) {
    const draft = await draftCredit(invoice, lines)
    expect(draft.statusCode, draft.body).toBe(201)
    const issued = await issueCredit(draft.json())
    expect(issued.statusCode, issued.body).toBe(200)
    return issued.json() as { id: string; number: string; total: string; version: number }
  }
  const getInvoice = async (id: string) =>
    (await call('GET', `/api/v1/invoices/${id}`)).json() as Record<string, unknown>

  // Observe a real PostgreSQL waiter before committing the winning transaction; no timing sleeps.
  async function waitForBlockedBy(pid: number) {
    const deadline = Date.now() + 5000
    while (Date.now() < deadline) {
      const [row] =
        await fixture.client`select exists(select 1 from pg_stat_activity where ${pid} = any(pg_blocking_pids(pid))) as blocked`
      if (row!.blocked) return
    }
    throw new Error('Expected a second connection to block on the invoice row')
  }

  it.each(['create', 'update', 'issue'] as const)(
    'serializes cancellation against credit %s',
    async (action) => {
      const invoice = await issuedInvoice()
      const lines = [{ invoiceLineId: invoice.lines[0]!.id, quantity: 1 }]
      const draft = action === 'create' ? null : (await draftCredit(invoice, lines)).json()
      let request!: ReturnType<typeof post>
      await fixture.client.begin(async (tx) => {
        const [holder] = await tx`select pg_backend_pid() as pid`
        await tx`select id from invoices where id=${invoice.id} for update`
        request = (
          action === 'create'
            ? draftCredit(invoice, lines)
            : action === 'issue'
              ? issueCredit(draft)
              : call('PATCH', `/api/v1/credit-notes/${draft.id}`, {
                  expectedVersion: draft.version,
                  reason: 'Return',
                  lines,
                })
        ).then((response) => response)
        await waitForBlockedBy(holder!.pid)
        await tx`update invoices set status='cancelled', cancelled_at=now(), cancellation_reason='Wrong invoice' where id=${invoice.id}`
      })
      const response = await request
      expect(response.statusCode, response.body).toBe(409)
      expect(response.json().code).toBe('INVOICE_NOT_CREDITABLE')
      expect(
        await fixture.client`select id from credit_notes where invoice_id=${invoice.id} and status='issued'`,
      ).toHaveLength(0)
    },
  )

  it('serializes the SQL issue guard against cancellation on another connection', async () => {
    const invoice = await issuedInvoice()
    const draft = (
      await draftCredit(invoice, [{ invoiceLineId: invoice.lines[0]!.id, quantity: 1 }])
    ).json()
    let outcome!: Promise<string>
    await fixture.client.begin(async (tx) => {
      const [holder] = await tx`select pg_backend_pid() as pid`
      await tx`select id from invoices where id=${invoice.id} for update`
      outcome =
        fixture.client`update credit_notes set status='issued', number='AVO-2026-900003', issue_date='2026-11-13', issued_at=now() where id=${draft.id}`.then(
          () => 'unexpected success',
          (error: { code: string }) => error.code,
        )
      await waitForBlockedBy(holder!.pid)
      await tx`update invoices set status='cancelled', cancelled_at=now(), cancellation_reason='Wrong invoice' where id=${invoice.id}`
    })
    expect(await outcome).toBe('23514')
    expect(
      await fixture.client`select id from credit_notes where invoice_id=${invoice.id} and status='issued'`,
    ).toHaveLength(0)
  })

  it('keeps quantity returns eligible after all paid amounts are credited', async () => {
    const invoice = await issuedInvoice([
      lineInput('Paid goods', 3, '50.00', '20.00'),
      lineInput('Free sample', 2, '0.00', '20.00'),
    ])
    await credit(invoice, [{ invoiceLineId: invoice.lines[0]!.id, amount: '150.00' }])
    const eligibility = () => call('GET', `/api/v1/invoices/${invoice.id}/creditable-lines`)
    const before = await eligibility()
    expect(before.statusCode, before.body).toBe(200)
    expect(before.json()).toMatchObject({
      creditable: true,
      remainingAmount: '0.00',
      lines: [
        { remainingQuantity: 3, remainingNetAmount: '0.00' },
        { remainingQuantity: 2, remainingNetAmount: '0.00' },
      ],
    })
    const paidReturn = await credit(invoice, [{ invoiceLineId: invoice.lines[0]!.id, quantity: 3 }])
    expect(paidReturn.total).toBe('0.00')
    expect((await eligibility()).json()).toMatchObject({
      creditable: true,
      remainingAmount: '0.00',
    })
    const freeReturn = await credit(invoice, [{ invoiceLineId: invoice.lines[1]!.id, quantity: 2 }])
    expect(freeReturn.total).toBe('0.00')
    expect((await eligibility()).json()).toMatchObject({
      creditable: false,
      remainingAmount: '0.00',
      lines: [{ remainingQuantity: 0 }, { remainingQuantity: 0 }],
    })
  })

  it('records free returns and clamps the whole remaining quantity after an amount correction', async () => {
    const invoice = await issuedInvoice([
      lineInput('Paid', 3, '50.00', '20.00'),
      lineInput('Sample', 2, '0.00', '20.00'),
    ])
    await credit(invoice, [{ invoiceLineId: invoice.lines[0]!.id, amount: '10.10' }])
    const draft = await draftCredit(invoice, [
      { invoiceLineId: invoice.lines[0]!.id, quantity: 3 },
      { invoiceLineId: invoice.lines[1]!.id, quantity: 2 },
    ])
    expect(draft.statusCode, draft.body).toBe(201)
    expect(draft.json()).toMatchObject({
      subtotal: '139.90',
      taxTotal: '27.98',
      lines: [
        { quantity: 3, netAmount: '139.90' },
        { quantity: 2, netAmount: '0.00' },
      ],
    })
    expect((await issueCredit(draft.json())).statusCode).toBe(200)
  })

  it.each(['create', 'confirm'] as const)(
    'rechecks payment %s after a concurrent credit commits',
    async (action) => {
      const invoice = await issuedInvoice([lineInput('Wheat', 1, '100.00', '20.00')])
      const payload = {
        operationId: randomUUID(),
        invoiceId: invoice.id,
        amount: '100.00',
        currency: 'MAD',
        method: 'bank_transfer',
        status: 'pending',
        paymentDate: '2026-09-16',
        collectedOn: null,
        bankAccountId: null,
        reference: 'transfer',
        chequeBank: null,
        chequeNumber: null,
      }
      const pending = action === 'confirm' ? (await post('/api/v1/payments', payload)).json() : null
      const draft = (
        await draftCredit(invoice, [{ invoiceLineId: invoice.lines[0]!.id, amount: '50.00' }])
      ).json()
      let request!: ReturnType<typeof post>
      await fixture.client.begin(async (tx) => {
        const [holder] = await tx`select pg_backend_pid() as pid`
        await tx`select id from invoices where id=${invoice.id} for update`
        request = (
          action === 'create'
            ? post('/api/v1/payments', payload)
            : post(`/api/v1/payments/${pending.id}/confirm`, {
                expectedVersion: pending.version,
                collectedOn: '2026-09-16',
              })
        ).then((response) => response)
        await waitForBlockedBy(holder!.pid)
        await tx`update credit_notes set status='issued', number='AVO-2026-900001', issue_date='2026-11-13', issued_at=now() where id=${draft.id}`
      })
      const response = await request
      expect(response.statusCode, response.body).toBe(409)
      expect(response.json().code).toBe('OVERPAYMENT')
      expect(
        await fixture.client`select id from payments where invoice_id=${invoice.id} and status='confirmed'`,
      ).toHaveLength(0)
    },
  )

  it('books a later credit in its own month in reports and owner revenue', async () => {
    const invoice = await issuedInvoice([lineInput('Wheat', 1, '100.00', '20.00')], '2026-01-15')
    const draft = (
      await draftCredit(invoice, [{ invoiceLineId: invoice.lines[0]!.id, quantity: 1 }])
    ).json()
    // Issue through the real database guard with genuinely different document dates.
    await fixture.client`update credit_notes set status='issued', number='AVO-2026-900002', issue_date='2026-03-15', issued_at='2026-03-15T12:00:00Z' where id=${draft.id}`
    for (const [from, to, gross, net, vat] of [
      ['2026-01-01', '2026-01-31', '120.00', '100.00', '20.00'],
      ['2026-03-01', '2026-03-31', '-120.00', '-100.00', '-20.00'],
    ]) {
      const result = await call(
        'GET',
        `/api/v1/reports/analysis?from=${from}&to=${to}&timezone=Africa%2FCasablanca&sections=summary,revenue,vat,sales_by_client&limit=5`,
      )
      expect(result.statusCode, result.body).toBe(200)
      for (const section of result.json().sections) {
        const metrics = new Map(
          section.metrics.map((m: { key: string; value: string }) => [m.key, m.value]),
        )
        expect(metrics.get(section.key === 'summary' ? 'invoiced_gross' : 'gross')).toBe(gross)
        expect(metrics.get(section.key === 'summary' ? 'invoiced_net' : 'net')).toBe(net)
        expect(metrics.get(section.key === 'summary' ? 'invoiced_vat' : 'vat')).toBe(vat)
      }
      const owner = await createOwnerFinancialSummaryRepository(() => fixture.db).read(
        testOwnerId,
        from!,
        to!,
      )
      expect(owner[0]!.totals.revenue).toBe(gross)
      expect(owner[0]!.series.map((point) => point.revenue)).toEqual([gross])
    }
  })

  describe('arithmetic and the cap', () => {
    it('credits full or partial quantities and amounts with exact centimes and the line VAT rate', async () => {
      const invoice = await issuedInvoice()
      const [wheat, barley] = invoice.lines
      const quantity = await draftCredit(invoice, [{ invoiceLineId: wheat!.id, quantity: 1 }])
      expect(quantity.json()).toMatchObject({
        status: 'draft',
        number: null,
        kind: 'legal',
        invoiceNumber: invoice.number,
        subtotal: '100.00',
        taxTotal: '20.00',
        total: '120.00',
        lines: [{ quantity: 1, unitPrice: '100.00', vatRate: '20.00', netAmount: '100.00' }],
      })
      const amount = await draftCredit(invoice, [{ invoiceLineId: barley!.id, amount: '10.10' }])
      expect(amount.json()).toMatchObject({
        subtotal: '10.10',
        taxTotal: '1.01',
        total: '11.11',
        lines: [{ quantity: 0, netAmount: '10.10', taxAmount: '1.01' }],
      })
      // Both lines in a single note, summed exactly.
      const both = await draftCredit(invoice, [
        { invoiceLineId: wheat!.id, quantity: 2 },
        { invoiceLineId: barley!.id, quantity: 1 },
      ])
      expect(both.json()).toMatchObject({ subtotal: '250.55', taxTotal: '45.06', total: '295.61' })
    })

    it('gives the credit that exhausts a line its remaining VAT so the sum equals the invoice', async () => {
      const invoice = await issuedInvoice([lineInput('Rounding', 3, '33.33', '7.00')])
      const line = invoice.lines[0]!.id
      const notes = []
      for (const expected of ['2.33', '2.33', '2.34']) {
        const note = await credit(invoice, [{ invoiceLineId: line, quantity: 1 }])
        notes.push(note)
        const [row] = await fixture.client`select tax_total from credit_notes where id=${note.id}`
        expect(row!.tax_total).toBe(expected)
      }
      const [sum] =
        await fixture.client`select sum(subtotal) s, sum(tax_total) t, sum(total) g from credit_notes where status='issued'`
      expect([sum!.s, sum!.t, sum!.g]).toEqual(['99.99', '7.00', '106.99'])
      expect(await getInvoice(invoice.id)).toMatchObject({
        total: '106.99',
        creditedAmount: '106.99',
        netAmount: '0.00',
        creditableAmount: '0.00',
        creditNoteCount: 3,
      })
      const over = await draftCredit(invoice, [{ invoiceLineId: line, quantity: 1 }])
      expect(over.statusCode).toBe(409)
      expect(over.json().code).toBe('CREDIT_EXCEEDS_INVOICE')
    })

    it('refuses over-crediting a line by quantity or amount and malformed lines', async () => {
      const invoice = await issuedInvoice()
      const [wheat] = invoice.lines
      await credit(invoice, [{ invoiceLineId: wheat!.id, quantity: 2 }])
      for (const bad of [
        { invoiceLineId: wheat!.id, quantity: 2 },
        { invoiceLineId: wheat!.id, amount: '100.01' },
      ]) {
        const refused = await draftCredit(invoice, [bad])
        expect(refused.statusCode, refused.body).toBe(409)
        expect(refused.json().code).toBe('CREDIT_EXCEEDS_INVOICE')
      }
      expect(
        (await draftCredit(invoice, [{ invoiceLineId: wheat!.id, quantity: 1 }])).statusCode,
      ).toBe(201)
      expect(
        (
          await draftCredit(invoice, [{ invoiceLineId: wheat!.id, quantity: 1, amount: '1.00' }])
        ).json().code,
      ).toBe('INVALID_CREDIT_LINE')
      expect((await draftCredit(invoice, [{ invoiceLineId: wheat!.id }])).json().code).toBe(
        'INVALID_CREDIT_LINE',
      )
      expect(
        (await draftCredit(invoice, [{ invoiceLineId: randomUUID(), quantity: 1 }])).json().code,
      ).toBe('INVALID_CREDIT_LINE')
      expect(
        (
          await draftCredit(invoice, [
            { invoiceLineId: wheat!.id, quantity: 1 },
            { invoiceLineId: wheat!.id, quantity: 1 },
          ])
        ).json().code,
      ).toBe('DUPLICATE_CREDIT_LINE')
      expect(
        (
          await post('/api/v1/credit-notes', {
            invoiceId: invoice.id,
            reason: ' ',
            lines: [{ invoiceLineId: wheat!.id, quantity: 1 }],
          })
        ).statusCode,
      ).toBe(400)
      const lines = await call('GET', `/api/v1/invoices/${invoice.id}/creditable-lines`)
      expect(lines.json()).toMatchObject({
        creditable: true,
        creditedAmount: '240.00',
        lines: [
          { remainingQuantity: 1, remainingNetAmount: '100.00', creditedQuantity: 2 },
          { remainingQuantity: 1 },
        ],
      })
    })

    it('never lets concurrent credit notes exceed the invoice (service lock and database trigger)', async () => {
      const invoice = await issuedInvoice()
      const barley = invoice.lines[1]!
      const first = (await draftCredit(invoice, [{ invoiceLineId: barley.id, quantity: 1 }])).json()
      const second = (
        await draftCredit(invoice, [{ invoiceLineId: barley.id, quantity: 1 }])
      ).json()
      const results = await Promise.all([issueCredit(first), issueCredit(second)])
      expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409])
      expect(results.find((r) => r.statusCode === 409)!.json().code).toBe('CREDIT_EXCEEDS_INVOICE')
      expect(
        (await fixture.client`select count(*)::int n from credit_notes where status='issued'`)[0]!
          .n,
      ).toBe(1)
      // The service is bypassed: the trigger alone refuses the breach.
      const loser = results.find((r) => r.statusCode === 409)
        ? results[0]!.statusCode === 409
          ? first
          : second
        : first
      await expect(
        fixture.client`update credit_notes set status='issued', number='AVO-2026-009999', issued_at=now(), issue_date=current_date where id=${loser.id}`,
      ).rejects.toThrow(/cannot exceed/)
      // Header totals must equal the sum of the lines.
      const third = (
        await draftCredit(invoice, [{ invoiceLineId: invoice.lines[0]!.id, quantity: 1 }])
      ).json()
      await expect(
        fixture.client`update credit_notes set status='issued', number='AVO-2026-009998', issued_at=now(), issue_date=current_date, subtotal=1, tax_total=0, total=1 where id=${third.id}`,
      ).rejects.toThrow(/sum of its lines/)
      // HT, VAT and TTC of all issued notes together stay within the invoice.
      await expect(
        fixture.client`update credit_note_lines set net_amount=500, total_amount=500 where credit_note_id=${third.id}`,
      ).rejects.toThrow(/cannot exceed/)
    })

    it('refuses draft and cancelled invoices and invoices of nobody else', async () => {
      const draft = await post('/api/v1/invoices', {
        clientId,
        templateId: null,
        issueDate: '2026-09-15',
        dueDate: null,
        notes: null,
        paymentTerms: null,
        lines: [lineInput('Wheat', 1, '10.00', null)],
      })
      const draftLines = (await call('GET', `/api/v1/invoices/${draft.json().id}`)).json().lines
      const refusedDraft = await post('/api/v1/credit-notes', {
        invoiceId: draft.json().id,
        reason: 'x',
        lines: [{ invoiceLineId: draftLines[0].id, quantity: 1 }],
      })
      expect(refusedDraft.statusCode).toBe(409)
      expect(refusedDraft.json().code).toBe('INVOICE_NOT_CREDITABLE')
      const invoice = await issuedInvoice()
      const cancelled = await post(`/api/v1/invoices/${invoice.id}/cancel`, {
        expectedVersion: 2,
        reason: 'mistake',
      })
      expect(cancelled.statusCode, cancelled.body).toBe(200)
      const refused = await draftCredit(invoice, [
        { invoiceLineId: invoice.lines[0]!.id, quantity: 1 },
      ])
      expect(refused.statusCode).toBe(409)
      expect(refused.json().code).toBe('INVOICE_NOT_CREDITABLE')
      expect(
        (await call('GET', `/api/v1/invoices/${invoice.id}/creditable-lines`)).json(),
      ).toMatchObject({
        creditable: false,
        remainingAmount: '0.00',
      })
    })

    it('rejects a draft credit note whose invoice is cancelled before it is issued', async () => {
      const invoice = await issuedInvoice()
      const draft = (
        await draftCredit(invoice, [{ invoiceLineId: invoice.lines[0]!.id, quantity: 1 }])
      ).json()
      await post(`/api/v1/invoices/${invoice.id}/cancel`, { expectedVersion: 2, reason: 'mistake' })
      const issued = await issueCredit(draft)
      expect(issued.statusCode).toBe(409)
      expect(issued.json().code).toBe('INVOICE_NOT_CREDITABLE')
    })
  })

  describe('numbering, snapshots and immutability', () => {
    it('numbers AVO notes gap-free in issue order and leaves no gap on rollback', async () => {
      const invoice = await issuedInvoice()
      const wheat = invoice.lines[0]!.id
      const first = await credit(invoice, [{ invoiceLineId: wheat, quantity: 1 }])
      expect(first.number).toBe(`AVO-${year}-000001`)
      await expect(
        fixture.db.transaction(async (tx) => {
          await nextDocumentNumber(tx, 'AVO', 'Africa/Casablanca')
          throw new Error('rollback')
        }),
      ).rejects.toThrow('rollback')
      const drafts = await Promise.all(
        [1, 2, 3, 4].map(async () =>
          (await draftCredit(invoice, [{ invoiceLineId: wheat, amount: '1.00' }])).json(),
        ),
      )
      const issued = await Promise.all(drafts.map((d) => issueCredit(d)))
      for (const r of issued) expect(r.statusCode, r.body).toBe(200)
      const rows =
        await fixture.client`select number, issued_at, issue_date::text issue_date from credit_notes where status='issued' order by number`
      expect(rows.map((r) => r.number)).toEqual(
        Array.from({ length: 5 }, (_, i) => `AVO-${year}-${String(i + 1).padStart(6, '0')}`),
      )
      for (let i = 1; i < rows.length; i++)
        expect(new Date(rows[i]!.issued_at).getTime()).toBeGreaterThanOrEqual(
          new Date(rows[i - 1]!.issued_at).getTime(),
        )
      expect(rows[0]!.issue_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      // Drafts carry no number; a failed issue consumes none.
      const failing = (
        await draftCredit(invoice, [{ invoiceLineId: invoice.lines[1]!.id, quantity: 1 }])
      ).json()
      await fixture.client`update invoices set status='draft' where false`
      expect(
        (await post(`/api/v1/credit-notes/${failing.id}/issue`, { expectedVersion: 99 }))
          .statusCode,
      ).toBe(409)
      const next = await credit(invoice, [{ invoiceLineId: invoice.lines[1]!.id, quantity: 1 }])
      expect(next.number).toBe(`AVO-${year}-000006`)
    })

    it('uses the simple series AVS for a simple invoice and labels the credit note simple', async () => {
      await fixture.client`update company_settings set legal_type='individual' where id=1`
      const simple = await issuedInvoice([lineInput('Eggs', 2, '10.00', null)])
      expect(simple.number).toMatch(/^FS-/)
      const note = await credit(simple, [{ invoiceLineId: simple.lines[0]!.id, quantity: 1 }])
      expect(note.number).toBe(`AVS-${year}-000001`)
      expect((await call('GET', `/api/v1/credit-notes/${note.id}`)).json()).toMatchObject({
        kind: 'simple',
      })
      await fixture.client`update company_settings set legal_type='auto_entrepreneur' where id=1`
      const legal = await issuedInvoice([lineInput('Eggs', 2, '10.00', null)])
      const legalNote = await credit(legal, [{ invoiceLineId: legal.lines[0]!.id, quantity: 1 }])
      expect(legalNote.number).toBe(`AVO-${year}-000001`)
      await expect(
        fixture.client`update credit_notes set number='AVS-2026-000009' where id=${legalNote.id}`,
      ).rejects.toThrow()
    })

    it('copies the snapshots from the credited invoice, not from live company or client data', async () => {
      const invoice = await issuedInvoice()
      await fixture.client`update company_settings set legal_name='Renamed SARL', ice='999999999999999', city='Tanger' where id=1`
      await fixture.client`update clients set legal_name='Client Renamed' where id=${clientId}`
      const draft = (
        await draftCredit(invoice, [{ invoiceLineId: invoice.lines[0]!.id, quantity: 1 }])
      ).json()
      const [row] =
        await fixture.client`select issuer_snapshot->>'legalName' issuer, issuer_snapshot->>'ice' ice, client_snapshot->>'legalName' client, invoice_number, invoice_issue_date::text invoice_date, locale, kind from credit_notes where id=${draft.id}`
      expect(row).toMatchObject({
        issuer: 'Slama Agricole',
        ice: '001122334455667',
        client: 'Atlas SARL',
        invoice_number: invoice.number,
        invoice_date: '2026-09-15',
        kind: 'legal',
      })
      expect(draft).toMatchObject({
        clientDisplayName: 'Atlas SARL',
        invoiceIssueDate: '2026-09-15',
      })
      const issued = await issueCredit(draft)
      expect(issued.statusCode, issued.body).toBe(200)
      const [after] =
        await fixture.client`select issuer_snapshot->>'legalName' issuer from credit_notes where id=${draft.id}`
      expect(after!.issuer).toBe('Slama Agricole')
    })

    it('freezes an issued credit note, refuses edit, delete and cancellation, and protects the invoice', async () => {
      const invoice = await issuedInvoice()
      const note = await credit(invoice, [{ invoiceLineId: invoice.lines[0]!.id, quantity: 1 }])
      const edit = await call('PATCH', `/api/v1/credit-notes/${note.id}`, {
        expectedVersion: note.version,
        reason: 'changed',
        lines: [{ invoiceLineId: invoice.lines[0]!.id, quantity: 1 }],
      })
      expect(edit.statusCode).toBe(409)
      expect(edit.json().code).toBe('INVALID_STATUS')
      const del = await call('DELETE', `/api/v1/credit-notes/${note.id}`, {
        expectedVersion: note.version,
      })
      expect(del.statusCode).toBe(409)
      expect((await issueCredit({ id: note.id, version: note.version })).statusCode).toBe(409)
      for (const statement of [
        fixture.client`update credit_notes set reason='x' where id=${note.id}`,
        fixture.client`update credit_notes set total=1, subtotal=1, tax_total=0 where id=${note.id}`,
        fixture.client`update credit_notes set number='AVO-2026-000777' where id=${note.id}`,
        fixture.client`update credit_notes set status='draft' where id=${note.id}`,
        fixture.client`update credit_notes set issuer_snapshot='{}'::jsonb where id=${note.id}`,
        fixture.client`update credit_notes set invoice_id=${randomUUID()} where id=${note.id}`,
        fixture.client`update credit_note_lines set quantity=2 where credit_note_id=${note.id}`,
        fixture.client`delete from credit_note_lines where credit_note_id=${note.id}`,
        fixture.client`insert into credit_note_lines (credit_note_id,invoice_line_id,position,product_name,unit_price,net_amount,tax_amount,total_amount) select ${note.id},id,9,'x',1,1,0,1 from invoice_lines limit 1`,
        fixture.client`delete from credit_notes where id=${note.id}`,
      ])
        await expect(statement).rejects.toThrow(/immutable|cannot be deleted|23514|Numbered/)
      // Presentation fields still follow the lifecycle (PDF regeneration).
      await fixture.client`update credit_notes set appearance_snapshot='{"layout":"modern"}'::jsonb, content_version=content_version where id=${note.id}`
      // The credited invoice can no longer be cancelled (API and database).
      const cancel = await post(`/api/v1/invoices/${invoice.id}/cancel`, {
        expectedVersion: 2,
        reason: 'x',
      })
      expect(cancel.statusCode).toBe(409)
      expect(cancel.json().code).toBe('INVOICE_HAS_CREDIT_NOTES')
      await expect(
        fixture.client`update invoices set status='cancelled', cancelled_at=now(), cancellation_reason='x' where id=${invoice.id}`,
      ).rejects.toThrow(/credit notes/)
    })

    it('edits and deletes drafts, and a deleted draft never consumed a number', async () => {
      const invoice = await issuedInvoice()
      const draft = (
        await draftCredit(invoice, [{ invoiceLineId: invoice.lines[0]!.id, quantity: 1 }])
      ).json()
      const updated = await call('PATCH', `/api/v1/credit-notes/${draft.id}`, {
        expectedVersion: draft.version,
        reason: 'Corrected',
        lines: [{ invoiceLineId: invoice.lines[0]!.id, quantity: 2 }],
      })
      expect(updated.statusCode, updated.body).toBe(200)
      expect(updated.json()).toMatchObject({ reason: 'Corrected', total: '240.00', version: 2 })
      expect(
        (
          await call('PATCH', `/api/v1/credit-notes/${draft.id}`, {
            expectedVersion: 1,
            reason: 'x',
            lines: [{ invoiceLineId: invoice.lines[0]!.id, quantity: 1 }],
          })
        ).statusCode,
      ).toBe(409)
      expect(
        (await call('DELETE', `/api/v1/credit-notes/${draft.id}`, { expectedVersion: 2 }))
          .statusCode,
      ).toBe(204)
      expect((await call('GET', `/api/v1/credit-notes/${draft.id}`)).statusCode).toBe(404)
      expect(
        await fixture.client`select 1 from document_number_counters where series='AVO'`,
      ).toHaveLength(0)
      const audits =
        await fixture.client`select action from audit_events where entity_table='credit_notes' order by occurred_at, id`
      expect(audits.map((a) => a.action)).toEqual(['create', 'update', 'delete'])
    })

    it('audits the issue and lists credit notes per invoice and globally', async () => {
      const invoice = await issuedInvoice()
      const note = await credit(invoice, [{ invoiceLineId: invoice.lines[0]!.id, quantity: 1 }])
      const draft = (
        await draftCredit(invoice, [{ invoiceLineId: invoice.lines[1]!.id, quantity: 1 }])
      ).json()
      expect(
        (
          await fixture.client`select action from audit_events where entity_table='credit_notes' and entity_key->>'id'=${note.id} order by occurred_at, id`
        ).map((a) => a.action),
      ).toEqual(['create', 'issue'])
      const forInvoice = (await call('GET', `/api/v1/invoices/${invoice.id}/credit-notes`)).json()
      expect(forInvoice.map((n: { id: string }) => n.id).sort()).toEqual([note.id, draft.id].sort())
      const issuedOnly = (await call('GET', '/api/v1/credit-notes?status=issued')).json()
      expect(issuedOnly).toMatchObject({ total: 1, items: [{ id: note.id }] })
      expect(
        (await call('GET', `/api/v1/credit-notes?search=${invoice.number}`)).json().total,
      ).toBe(2)
      expect(
        (await call('GET', `/api/v1/credit-notes?search=Atlas&status=draft`)).json().total,
      ).toBe(1)
    })
  })

  describe('payments, balances and reporting', () => {
    const payment = (invoiceId: string, amount: string) =>
      post('/api/v1/payments', {
        operationId: randomUUID(),
        invoiceId,
        amount,
        currency: 'MAD',
        method: 'cash',
        status: 'confirmed',
        paymentDate: '2026-09-16',
        collectedOn: '2026-09-16',
        bankAccountId: null,
        reference: null,
        chequeBank: null,
        chequeNumber: null,
      })

    it('reduces the net amount due and reports a refund due after payment without touching payments', async () => {
      const invoice = await issuedInvoice()
      expect(await getInvoice(invoice.id)).toMatchObject({
        total: '415.61',
        creditedAmount: '0.00',
        netAmount: '415.61',
        outstandingAmount: '415.61',
        refundDueAmount: '0.00',
        creditableAmount: '415.61',
        paymentStatus: 'unpaid',
      })
      await credit(invoice, [{ invoiceLineId: invoice.lines[0]!.id, quantity: 1 }])
      expect(await getInvoice(invoice.id)).toMatchObject({
        creditedAmount: '120.00',
        netAmount: '295.61',
        outstandingAmount: '295.61',
        availableBalance: '295.61',
        creditNoteCount: 1,
        paymentStatus: 'unpaid',
      })
      // Payments cannot exceed the net amount due.
      const over = await payment(invoice.id, '295.62')
      expect(over.statusCode).toBe(409)
      expect(over.json().code).toBe('OVERPAYMENT')
      expect((await payment(invoice.id, '200.00')).statusCode).toBe(201)
      expect(await getInvoice(invoice.id)).toMatchObject({
        paymentStatus: 'partial',
        outstandingAmount: '95.61',
      })
      expect((await payment(invoice.id, '95.61')).statusCode).toBe(201)
      expect(await getInvoice(invoice.id)).toMatchObject({
        paymentStatus: 'paid',
        outstandingAmount: '0.00',
        refundDueAmount: '0.00',
      })
      // A credit note issued after full payment: the surplus is a refund due, payments are unchanged.
      const second = await credit(invoice, [{ invoiceLineId: invoice.lines[0]!.id, quantity: 2 }])
      expect(second.total).toBe('240.00')
      expect(await getInvoice(invoice.id)).toMatchObject({
        paymentStatus: 'paid',
        paidAmount: '295.61',
        netAmount: '55.61',
        outstandingAmount: '0.00',
        refundDueAmount: '240.00',
      })
      expect(
        (await fixture.client`select sum(amount) a from payments where status='confirmed'`)[0]!.a,
      ).toBe('295.61')
      const list = (await call('GET', '/api/v1/invoices?paymentStatus=paid')).json()
      expect(list.items[0]).toMatchObject({ refundDueAmount: '240.00' })
    })

    it('marks an unpaid fully credited invoice credited, with filters and sorting by net due', async () => {
      const invoice = await issuedInvoice([lineInput('Wheat', 1, '100.00', null)])
      await credit(invoice, [{ invoiceLineId: invoice.lines[0]!.id, quantity: 1 }])
      expect(await getInvoice(invoice.id)).toMatchObject({
        paymentStatus: 'credited',
        outstandingAmount: '0.00',
        creditableAmount: '0.00',
        overdue: false,
      })
      const credited = (await call('GET', '/api/v1/invoices?paymentStatus=credited')).json()
      expect(credited.total).toBe(1)
      expect((await call('GET', '/api/v1/invoices?paymentStatus=unpaid')).json().total).toBe(0)
      expect((await call('GET', '/api/v1/invoices?overdue=true')).json().total).toBe(0)
      expect((await call('GET', '/api/v1/invoices?sortBy=outstandingAmount')).statusCode).toBe(200)
      const creditable = await call('GET', `/api/v1/invoices/${invoice.id}/creditable-lines`)
      expect(creditable.json()).toMatchObject({ creditable: false, remainingAmount: '0.00' })
    })

    it('nets reports, client balances and the outstanding queries by issued credit notes', async () => {
      const invoice = await issuedInvoice([lineInput('Wheat', 4, '100.00', '20.00')])
      await credit(invoice, [{ invoiceLineId: invoice.lines[0]!.id, quantity: 1 }])
      // A draft credit note changes nothing.
      await draftCredit(invoice, [{ invoiceLineId: invoice.lines[0]!.id, quantity: 1 }])
      await payment(invoice.id, '100.00')
      const criteria = 'from=2026-01-01&to=2026-12-31&timezone=Africa%2FCasablanca'
      const analysis = await call(
        'GET',
        `/api/v1/reports/analysis?${criteria}&sections=summary,revenue,vat,outstanding,sales_by_client&limit=5`,
      )
      expect(analysis.statusCode, analysis.body).toBe(200)
      const sections = analysis.json().sections as {
        key: string
        metrics: { key: string; value: string }[]
        rows: { net: string | null; gross: string | null; amount: string | null }[]
      }[]
      const section = (key: string) => sections.find((s) => s.key === key)!
      const metric = (key: string, name: string) =>
        section(key).metrics.find((m) => m.key === name)?.value
      // 480.00 invoiced, 120.00 credited -> 360.00; paid 100.00 -> 260.00 left.
      expect(metric('summary', 'invoiced_gross')).toBe('360.00')
      expect(metric('summary', 'invoiced_net')).toBe('300.00')
      expect(metric('summary', 'invoiced_vat')).toBe('60.00')
      expect(metric('summary', 'outstanding')).toBe('260.00')
      expect(metric('outstanding', 'amount')).toBe('260.00')
      expect(section('revenue').rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ gross: '480.00', net: '400.00' }),
          expect.objectContaining({ gross: '-120.00', net: '-100.00' }),
        ]),
      )
      expect(section('sales_by_client').rows[0]).toMatchObject({ gross: '360.00' })
      const client = await call('GET', `/api/v1/clients?q=Atlas`)
      expect(client.statusCode, client.body).toBe(200)
      const [summary] = await fixture.client`select
        sum(i.total - invoice_credited_total(i.id)) invoiced,
        sum(i.total - invoice_credited_subtotal(i.id)) gross_wrong
        from invoices i`
      expect(summary!.invoiced).toBe('360.00')
    })
  })

  describe('PDF', () => {
    it('renders an Avoir from the stored snapshot and serves it through the artifact download', async () => {
      const invoice = await issuedInvoice()
      const note = await credit(invoice, [{ invoiceLineId: invoice.lines[0]!.id, quantity: 1 }])
      const draft = (
        await draftCredit(invoice, [{ invoiceLineId: invoice.lines[1]!.id, quantity: 1 }])
      ).json()
      expect((await post(`/api/v1/credit-notes/${draft.id}/pdf`)).statusCode).toBe(409)
      const worker = createSalesModule(
        () => fixture.db,
        storage,
        createMediaModule(() => fixture.db, storage).publicApi,
      ).worker
      // The first job is the invoice PDF, the second the credit note PDF.
      while (await worker.runOne()) {
        /* drain */
      }
      const listed = await call('GET', `/api/v1/credit-notes/${note.id}/artifacts`)
      expect(listed.statusCode, listed.body).toBe(200)
      expect(listed.json()).toHaveLength(1)
      const download = await call('GET', `/api/v1/artifacts/${listed.json()[0].id}/download`)
      expect(download.statusCode).toBe(200)
      expect(download.headers['content-type']).toContain('application/pdf')
      expect(download.rawPayload.subarray(0, 5).toString()).toBe('%PDF-')
      // Changing the live profile never changes what regeneration prints.
      await fixture.client`update company_settings set legal_name='Renamed SARL' where id=1`
      const regenerated = await post(`/api/v1/documents/credit_note/${note.id}/regenerate-pdf`, {
        design: 'saved',
      })
      expect(regenerated.statusCode, regenerated.body).toBe(200)
      expect(
        (
          await post(`/api/v1/documents/credit_note/${draft.id}/regenerate-pdf`, {
            design: 'saved',
          })
        ).statusCode,
      ).toBe(409)
      const [stored] =
        await fixture.client`select issuer_snapshot->>'legalName' name from credit_notes where id=${note.id}`
      expect(stored!.name).toBe('Slama Agricole')
    })
  })

  describe('permissions (the API is authoritative)', () => {
    async function withPermissions(keys: string[]) {
      await fixture.client`delete from user_roles where user_id=${testUserId}`
      const [role] =
        await fixture.client`insert into roles (key,name) values (${'role_' + randomUUID().slice(0, 8)},'Custom') returning id`
      await fixture.client`insert into user_roles (user_id,role_id) values (${testUserId},${role!.id})`
      for (const key of keys)
        await fixture.client`insert into role_permissions (role_id,permission_id) select ${role!.id},id from permissions where key=${key}`
    }

    it('requires the matching credit_notes grant for every route and invoices.read to create', async () => {
      const invoice = await issuedInvoice()
      const wheat = invoice.lines[0]!.id
      const draft = (await draftCredit(invoice, [{ invoiceLineId: wheat, quantity: 1 }])).json()
      const issuedNote = await credit(invoice, [{ invoiceLineId: wheat, quantity: 1 }])
      const body = {
        invoiceId: invoice.id,
        reason: 'x',
        lines: [{ invoiceLineId: wheat, quantity: 1 }],
      }
      await withPermissions([])
      for (const [method, url, payload] of [
        ['GET', '/api/v1/credit-notes'],
        ['GET', `/api/v1/credit-notes/${draft.id}`],
        ['POST', '/api/v1/credit-notes', body],
        [
          'PATCH',
          `/api/v1/credit-notes/${draft.id}`,
          { expectedVersion: 1, reason: 'x', lines: body.lines },
        ],
        ['DELETE', `/api/v1/credit-notes/${draft.id}`, { expectedVersion: 1 }],
        ['POST', `/api/v1/credit-notes/${draft.id}/issue`, { expectedVersion: 1 }],
        ['POST', `/api/v1/credit-notes/${issuedNote.id}/pdf`, {}],
        ['GET', `/api/v1/credit-notes/${issuedNote.id}/artifacts`],
        ['GET', `/api/v1/invoices/${invoice.id}/credit-notes`],
        ['GET', `/api/v1/invoices/${invoice.id}/creditable-lines`],
        [
          'POST',
          `/api/v1/documents/credit_note/${issuedNote.id}/regenerate-pdf`,
          { design: 'saved' },
        ],
      ] as const)
        expect(
          (await call(method, url, payload as object | undefined)).statusCode,
          `${method} ${url}`,
        ).toBe(403)

      await withPermissions(['credit_notes.read'])
      expect((await call('GET', '/api/v1/credit-notes')).statusCode).toBe(200)
      expect((await call('GET', `/api/v1/credit-notes/${draft.id}`)).statusCode).toBe(200)
      expect((await call('POST', '/api/v1/credit-notes', body)).statusCode).toBe(403)
      expect(
        (await call('POST', `/api/v1/credit-notes/${draft.id}/issue`, { expectedVersion: 1 }))
          .statusCode,
      ).toBe(403)
      expect((await call('GET', `/api/v1/invoices/${invoice.id}/credit-notes`)).statusCode).toBe(
        403,
      )

      // Creating also needs to read the invoice.
      await withPermissions(['credit_notes.create'])
      expect((await call('POST', '/api/v1/credit-notes', body)).statusCode).toBe(403)
      await withPermissions(['credit_notes.create', 'invoices.read'])
      expect((await call('POST', '/api/v1/credit-notes', body)).statusCode).toBe(201)
      expect(
        (await call('GET', `/api/v1/invoices/${invoice.id}/creditable-lines`)).statusCode,
      ).toBe(200)
      expect(
        (await call('POST', `/api/v1/credit-notes/${draft.id}/issue`, { expectedVersion: 1 }))
          .statusCode,
      ).toBe(403)

      await withPermissions(['credit_notes.update'])
      expect(
        (await call('POST', `/api/v1/credit-notes/${draft.id}/issue`, { expectedVersion: 1 }))
          .statusCode,
      ).toBe(200)
      expect(
        (await call('DELETE', `/api/v1/credit-notes/${draft.id}`, { expectedVersion: 2 }))
          .statusCode,
      ).toBe(403)
      await withPermissions(['credit_notes.delete'])
      const another = (
        await fixture.client`select id, version from credit_notes where status='draft' limit 1`
      )[0]!
      expect(
        (
          await call('DELETE', `/api/v1/credit-notes/${another.id}`, {
            expectedVersion: another.version,
          })
        ).statusCode,
      ).toBe(204)
      // Deleting an issued credit note stays refused even with the delete grant.
      expect(
        (await call('DELETE', `/api/v1/credit-notes/${draft.id}`, { expectedVersion: 3 }))
          .statusCode,
      ).toBe(409)
    })

    it('registers credit_notes read, create, update and delete in the catalog and grants them to the admin role', async () => {
      const keys =
        await fixture.client`select key from permissions where key like 'credit_notes.%' order by key`
      expect(keys.map((k) => k.key)).toEqual([
        'credit_notes.create',
        'credit_notes.delete',
        'credit_notes.read',
        'credit_notes.update',
      ])
      const admin =
        await fixture.client`select p.key from role_permissions rp join roles r on r.id=rp.role_id join permissions p on p.id=rp.permission_id where r.key='admin' and p.key like 'credit_notes.%'`
      expect(admin).toHaveLength(4)
    })
  })

  describe('tenant isolation and the restricted runtime role', () => {
    async function runtimeClient(organizationId: string) {
      const schema = (
        await fixture.client<{ schema: string }[]>`select current_schema() as schema`
      )[0]!.schema
      for (const statement of runtimeGrantStatements(`"${fixture.role}"`, `"${schema}"`))
        await fixture.client.unsafe(statement)
      return postgres(process.env.TEST_DATABASE_URL!, {
        max: 2,
        connection: {
          search_path: `${schema},pg_catalog`,
          role: fixture.role,
          'app.organization_id': organizationId,
        },
        onnotice: () => {},
      })
    }

    it('hides credit notes from other organizations and refuses a cross-tenant insert', async () => {
      const invoice = await issuedInvoice()
      await credit(invoice, [{ invoiceLineId: invoice.lines[0]!.id, quantity: 1 }])
      const otherOrg = randomUUID()
      const otherOwner = randomUUID()
      await fixture.client`insert into platform_users (id,email,password_hash) values (${otherOwner},'other-owner@example.test','x')`
      await fixture.client`insert into organizations(id,owner_id,name,slug,activated_at) values (${otherOrg},${otherOwner},'Other','other',now())`
      const other = await runtimeClient(otherOrg)
      try {
        expect(await other`select 1 from credit_notes`).toHaveLength(0)
        expect(await other`select 1 from credit_note_lines`).toHaveLength(0)
        expect(await other`select invoice_credited_total(${invoice.id}::uuid) as total`).toEqual([
          { total: '0' },
        ])
        await expect(
          other`insert into credit_notes (organization_id,kind,invoice_id,invoice_number,invoice_issue_date,currency,locale,reason,issuer_snapshot,client_snapshot,appearance_snapshot) values (${orgA},'legal',${invoice.id},${invoice.number},'2026-09-15','MAD','fr-MA','x','{}','{}','{}')`,
        ).rejects.toThrow()
        // A foreign tenant cannot credit another tenant's invoice either (the invoice is invisible).
        await expect(
          other`insert into credit_notes (kind,invoice_id,invoice_number,invoice_issue_date,currency,locale,reason,issuer_snapshot,client_snapshot,appearance_snapshot) values ('legal',${invoice.id},${invoice.number},'2026-09-15','MAD','fr-MA','x','{}','{}','{}')`,
        ).rejects.toThrow()
      } finally {
        await other.end({ timeout: 2 })
      }
    })

    it('runs create, issue, edit refusal and delete refusal under the restricted role grants', async () => {
      const invoice = await issuedInvoice()
      const wheat = invoice.lines[0]!.id
      const runtime = await runtimeClient(orgA)
      try {
        // The whole application path (permissions, numbering, jobs, audit) under the real grants.
        app.database = () => drizzle(runtime, { schema: tables }) as never
        const draft = await draftCredit(invoice, [{ invoiceLineId: wheat, quantity: 1 }])
        expect(draft.statusCode, draft.body).toBe(201)
        const edited = await call('PATCH', `/api/v1/credit-notes/${draft.json().id}`, {
          expectedVersion: 1,
          reason: 'Updated',
          lines: [{ invoiceLineId: wheat, quantity: 2 }],
        })
        expect(edited.statusCode, edited.body).toBe(200)
        const issued = await issueCredit(edited.json())
        expect(issued.statusCode, issued.body).toBe(200)
        expect(issued.json().number).toBe(`AVO-${year}-000001`)
        const second = await draftCredit(invoice, [{ invoiceLineId: wheat, quantity: 1 }])
        expect(second.statusCode, second.body).toBe(201)
        expect((await issueCredit(second.json())).statusCode).toBe(200)
        const refused = await draftCredit(invoice, [{ invoiceLineId: wheat, quantity: 1 }])
        expect(refused.statusCode).toBe(409)
        // No UPDATE after issue, no DELETE of numbered documents, counters cannot be deleted.
        await expect(
          runtime`update credit_notes set reason='tampered' where id=${issued.json().id}`,
        ).rejects.toThrow(/immutable/)
        await expect(
          runtime`delete from credit_notes where id=${issued.json().id}`,
        ).rejects.toThrow(/cannot be deleted/)
        await expect(runtime`delete from document_number_counters`).rejects.toThrow(
          /permission denied/,
        )
        const [draftOnly] =
          await runtime`insert into credit_notes (kind,invoice_id,invoice_number,invoice_issue_date,currency,locale,reason,issuer_snapshot,client_snapshot,appearance_snapshot) values ('legal',${invoice.id},${invoice.number},'2026-09-15','MAD','fr-MA','draft','{}','{}','{}') returning id`
        await runtime`delete from credit_notes where id=${draftOnly!.id}`
        await expect(
          runtime`insert into credit_notes (kind,status,invoice_id,invoice_number,invoice_issue_date,currency,locale,reason,issuer_snapshot,client_snapshot,appearance_snapshot) values ('legal','issued',${invoice.id},${invoice.number},'2026-09-15','MAD','fr-MA','x','{}','{}','{}')`,
        ).rejects.toThrow()
      } finally {
        app.database = () => fixture.db
        await runtime.end({ timeout: 2 })
      }
    })
  })

  it('pins search_path on every credit note integrity function', async () => {
    const unpinned = await fixture.client`
      select p.proname from pg_proc p where p.pronamespace = current_schema()::regnamespace
        and p.proname in ('guard_credit_note_insert','guard_issued_credit_note','guard_credit_note_line','invoice_credited_total','invoice_credited_subtotal','invoice_credited_tax')
        and not coalesce(p.proconfig::text like '%search_path=pg_catalog, pg_temp%', false)`
    expect(unpinned).toEqual([])
    expect(
      (
        await fixture.client`select 1 from pg_proc p where p.pronamespace = current_schema()::regnamespace and p.proname like 'guard_%credit_note%'`
      ).length,
    ).toBe(3)
  })
})
