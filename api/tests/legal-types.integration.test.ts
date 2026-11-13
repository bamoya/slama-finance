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

const orgA = '10000000-0000-4000-8000-000000000001'
const headers = { origin: 'http://localhost:5173', 'x-organization-id': orgA }
const clientId = '33333333-3333-4333-8333-333333333333'

const requiredFields: Record<string, string[]> = {
  auto_entrepreneur: ['legalName', 'ice', 'addressLine1', 'city'],
  sole_trader: [
    'legalName',
    'ice',
    'taxIdentifier',
    'registrationNumber',
    'professionalTaxNumber',
    'addressLine1',
    'city',
  ],
  association: ['legalName', 'ice', 'addressLine1', 'city'],
  cooperative: ['legalName', 'ice', 'addressLine1', 'city'],
}
for (const type of ['sarl', 'sarl_au', 'sa', 'other_company'])
  requiredFields[type] = [
    'legalName',
    'ice',
    'taxIdentifier',
    'registrationNumber',
    'professionalTaxNumber',
    'shareCapital',
    'addressLine1',
    'city',
  ]
const complete = `legal_name='Slama Agricole', ice='001122334455667', tax_identifier='12345678', registration_number='998877', registration_city='Fes', professional_tax_number='4455', share_capital='100000.00', address_line1='Rue Atlas', city='Casablanca'`
const cleared = `legal_name=null, ice=null, tax_identifier=null, registration_number=null, registration_city=null, professional_tax_number=null, share_capital=null, address_line1=null, city=null`

describe('Organization legal types, simple invoices and VAT exemption', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let app: Awaited<ReturnType<typeof buildApp>>
  let cookies: { slama_session: string }

  beforeEach(async () => {
    fixture = await isolatedDatabase()
    // The default legal type is "individual" with only the basics a document needs.
    await fixture.client`update company_settings set legal_name='Karim Alaoui', address_line1='Rue Atlas', city='Casablanca' where id=1`
    await fixture.client`insert into clients (id,type,legal_name,address_line1,city) values (${clientId},'company','Atlas SARL','Rue Hassan','Rabat')`
    const hash = await createPasswordService().hash('legal-types-password-123')
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
      payload: { email: 'operator@example.test', password: 'legal-types-password-123' },
    })
    cookies = { slama_session: login.cookies[0]!.value }
  })
  afterEach(async () => {
    await app?.close()
    await fixture?.cleanup()
  })
  const post = (url: string, payload: object) =>
    app.inject({ method: 'POST', url, headers, cookies, payload })
  const get = (url: string) => app.inject({ method: 'GET', url, headers, cookies })
  const input = (vatRate: string | null = null) => ({
    clientId,
    templateId: null,
    issueDate: '2026-10-02',
    dueDate: null,
    notes: 'n',
    paymentTerms: 'Cash',
    lines: [
      { productVariantId: null, productName: 'Wheat', quantity: 2, unitPrice: '50.00', vatRate },
    ],
  })
  async function draft(vatRate: string | null = null) {
    const created = await post('/api/v1/invoices', input(vatRate))
    expect(created.statusCode, created.body).toBe(201)
    return created.json() as { id: string; version: number }
  }
  const issue = (id: string) => post(`/api/v1/invoices/${id}/issue`, { expectedVersion: 1 })
  async function patchCompany(changes: Record<string, unknown>) {
    const current = (await get('/api/v1/company-settings')).json()
    const {
      id: _id,
      version,
      createdAt: _c,
      updatedAt: _u,
      createdByActorId: _cb,
      updatedByActorId: _ub,
      ...body
    } = current
    return app.inject({
      method: 'PATCH',
      url: '/api/v1/company-settings',
      headers,
      cookies,
      payload: { ...body, ...changes, expectedVersion: version },
    })
  }
  const year = new Intl.DateTimeFormat('en', {
    year: 'numeric',
    timeZone: 'Africa/Casablanca',
  }).format(new Date())

  it('serves the read-only requirements reference with the proposed field sets', async () => {
    const response = await get('/api/v1/company-settings/legal-requirements')
    expect(response.statusCode, response.body).toBe(200)
    const items = response.json().items as {
      legalType: string
      fields: { field: string; requiredForLegalInvoice: boolean }[]
    }[]
    expect(items.map((i) => i.legalType).sort()).toEqual(
      [
        'association',
        'auto_entrepreneur',
        'cooperative',
        'other_company',
        'sa',
        'sarl',
        'sarl_au',
        'sole_trader',
      ].sort(),
    )
    for (const item of items) {
      const required = item.fields.filter((f) => f.requiredForLegalInvoice).map((f) => f.field)
      expect(required.sort(), item.legalType).toEqual([...requiredFields[item.legalType]!].sort())
    }
    // Individuals are not registered: no entry, nothing asked.
    expect(items.some((i) => i.legalType === 'individual')).toBe(false)
    // Optional (shown, not required) fields.
    const ae = items.find((i) => i.legalType === 'auto_entrepreneur')!
    expect(ae.fields).toContainEqual({
      field: 'professionalTaxNumber',
      requiredForLegalInvoice: false,
    })
    const unauthenticated = await app.inject({
      url: '/api/v1/company-settings/legal-requirements',
      headers,
    })
    expect(unauthenticated.statusCode).toBe(403)
  })

  it('issues simple invoices (FS series, gap-free) for individuals, separate from the FAC series', async () => {
    const a = await issue((await draft()).id)
    expect(a.statusCode, a.body).toBe(200)
    expect(a.json()).toMatchObject({
      kind: 'simple',
      number: `FS-${year}-000001`,
      status: 'issued',
    })
    const b = await issue((await draft()).id)
    expect(b.json()).toMatchObject({ kind: 'simple', number: `FS-${year}-000002` })
    await fixture.client`update company_settings set legal_type='auto_entrepreneur', ice='001122334455667' where id=1`
    const legal = await issue((await draft()).id)
    expect(legal.json()).toMatchObject({ kind: 'legal', number: `FAC-${year}-000001` })
    // Drafts have no kind; FS keeps counting after the switch back.
    const pending = await draft()
    expect((await get(`/api/v1/invoices/${pending.id}`)).json().kind).toBeNull()
    await fixture.client`update company_settings set legal_type='individual' where id=1`
    expect((await issue(pending.id)).json().number).toBe(`FS-${year}-000003`)
    const counters =
      await fixture.client`select series,last from document_number_counters order by series`
    expect(counters).toEqual([
      { series: 'FAC', last: 1 },
      { series: 'FS', last: 3 },
    ])
  })

  it.each(Object.keys(requiredFields))(
    'refuses a legal issue for %s with missing fields, then issues FAC once complete',
    async (type) => {
      await fixture.client.unsafe(
        `update company_settings set legal_type='${type}', ${complete} where id=1`,
      )
      const created = await draft()
      await fixture.client.unsafe(`update company_settings set ${cleared} where id=1`)
      const refused = await issue(created.id)
      expect(refused.statusCode, refused.body).toBe(409)
      expect(refused.json().code).toBe('MISSING_LEGAL_IDENTITY')
      expect(Object.keys(refused.json().fieldErrors).sort()).toEqual(
        [...requiredFields[type]!].sort(),
      )
      // Nothing was consumed or written by the refused issue.
      expect(await fixture.client`select 1 from document_number_counters`).toHaveLength(0)
      expect((await get(`/api/v1/invoices/${created.id}`)).json()).toMatchObject({
        status: 'draft',
        number: null,
        kind: null,
      })
      await fixture.client.unsafe(`update company_settings set ${complete} where id=1`)
      const issued = await issue(created.id)
      expect(issued.statusCode, issued.body).toBe(200)
      expect(issued.json()).toMatchObject({ kind: 'legal', number: `FAC-${year}-000001` })
    },
  )

  it('lists only the fields still missing and ignores optional ones', async () => {
    await fixture.client.unsafe(
      `update company_settings set legal_type='sarl', ${complete} where id=1`,
    )
    const created = await draft()
    await fixture.client`update company_settings set share_capital=null, registration_number=null, registration_city=null where id=1`
    const refused = await issue(created.id)
    expect(Object.keys(refused.json().fieldErrors).sort()).toEqual([
      'registrationNumber',
      'shareCapital',
    ])
    // The association needs no capital, RC or TP.
    await fixture.client`update company_settings set legal_type='association' where id=1`
    expect((await issue(created.id)).json().kind).toBe('legal')
  })

  it('freezes the document kind and the legal identity snapshot at issue', async () => {
    await fixture.client.unsafe(
      `update company_settings set legal_type='sarl', ${complete} where id=1`,
    )
    const issued = (await issue((await draft()).id)).json()
    const snapshot = (
      await fixture.client`select issuer_snapshot from invoices where id=${issued.id}`
    )[0]!.issuer_snapshot
    expect(snapshot).toMatchObject({
      legalType: 'sarl',
      vatRegime: 'subject',
      vatExemptionMention: null,
      documentKind: 'legal',
      shareCapital: '100000.00',
      professionalTaxNumber: '4455',
    })
    await expect(
      fixture.client`update invoices set kind='simple' where id=${issued.id}`,
    ).rejects.toThrow(/immutable/)
    await expect(
      fixture.client`update invoices set issuer_snapshot=jsonb_set(issuer_snapshot,'{legalType}','"individual"') where id=${issued.id}`,
    ).rejects.toThrow(/immutable/)
    // Later profile edits never change the issued document.
    await fixture.client`update company_settings set legal_type='individual', share_capital='1.00' where id=1`
    expect(
      (
        await fixture.client`select issuer_snapshot->>'legalType' as t from invoices where id=${issued.id}`
      )[0]!.t,
    ).toBe('sarl')
    // A kind can only go with its series prefix.
    await expect(
      fixture.client`insert into invoices(number,kind,status,client_id,issue_date,due_date,issuer_snapshot,client_snapshot,appearance_snapshot,issued_at) values('FAC-2026-777777','simple','issued',${clientId},'2026-10-02','2026-10-03','{}','{}','{}',now())`,
    ).rejects.toThrow(/invoices_kind/)
  })

  it('stamps the identity on estimates and delivery notes without gating them', async () => {
    await fixture.client`update company_settings set legal_type='auto_entrepreneur', vat_regime='exempt', ice='001122334455667', share_capital='5.00', professional_tax_number='55' where id=1`
    const estimate = await post('/api/v1/estimates', {
      ...input(),
      dueDate: undefined,
      validUntil: '2026-10-20',
    })
    expect(estimate.statusCode, estimate.body).toBe(201)
    const row = (
      await fixture.client`select issuer_snapshot from estimates where id=${estimate.json().id}`
    )[0]!.issuer_snapshot
    expect(row).toMatchObject({
      legalType: 'auto_entrepreneur',
      vatRegime: 'exempt',
      vatExemptionMention: 'TVA non applicable',
      professionalTaxNumber: '55',
      shareCapital: null,
    })
    // Estimates and delivery notes issue even when a legal invoice would be refused.
    await fixture.client`update company_settings set legal_type='sole_trader', ice=null where id=1`
    const issued = await post(`/api/v1/estimates/${estimate.json().id}/issue`, {
      expectedVersion: estimate.json().version,
    })
    expect(issued.statusCode, issued.body).toBe(200)
    expect(issued.json().number).toMatch(/^DEV-/)
  })

  describe('VAT regime', () => {
    it('refuses positive VAT rates for an exempt company and snapshots the default mention', async () => {
      await fixture.client`update company_settings set vat_regime='exempt' where id=1`
      const refused = await post('/api/v1/invoices', input('20.00'))
      expect(refused.statusCode).toBe(400)
      expect(refused.json().code).toBe('VAT_EXEMPT_REGIME')
      const zero = await post('/api/v1/invoices', input('0.00'))
      expect(zero.statusCode, zero.body).toBe(201)
      const created = await draft(null)
      const issued = await issue(created.id)
      expect(issued.statusCode, issued.body).toBe(200)
      expect(
        (await fixture.client`select issuer_snapshot from invoices where id=${created.id}`)[0]!
          .issuer_snapshot,
      ).toMatchObject({ vatRegime: 'exempt', vatExemptionMention: 'TVA non applicable' })
    })

    it('catches a VAT draft at issue when the regime changed afterwards, and prints a custom mention', async () => {
      const taxed = await draft('20.00')
      await fixture.client`update company_settings set vat_regime='exempt', vat_exemption_mention='Exonéré (texte validé)' where id=1`
      const refused = await issue(taxed.id)
      expect(refused.statusCode).toBe(400)
      expect(refused.json().code).toBe('VAT_EXEMPT_REGIME')
      const clean = await draft(null)
      expect((await issue(clean.id)).statusCode).toBe(200)
      expect(
        (
          await fixture.client`select issuer_snapshot->>'vatExemptionMention' as m from invoices where id=${clean.id}`
        )[0]!.m,
      ).toBe('Exonéré (texte validé)')
    })

    it('validates the regime and the exemption mention in company settings', async () => {
      await fixture.client`update company_settings set default_vat_rate='20.00' where id=1`
      const refused = await patchCompany({ vatRegime: 'exempt' })
      expect(refused.statusCode, refused.body).toBe(400)
      expect(refused.json().code).toBe('VAT_EXEMPT_REGIME')
      const cleared = await patchCompany({ vatRegime: 'exempt', defaultVatRate: null })
      expect(cleared.statusCode, cleared.body).toBe(200)
      expect(cleared.json()).toMatchObject({ vatRegime: 'exempt', vatExemptionMention: null })
      const custom = await patchCompany({ vatExemptionMention: '  Mention validée  ' })
      expect(custom.json().vatExemptionMention).toBe('Mention validée')
      expect((await patchCompany({ vatExemptionMention: 'x'.repeat(301) })).statusCode).toBe(400)
      expect((await patchCompany({ vatRegime: 'other' })).statusCode).toBe(400)
    })
  })

  describe('company settings', () => {
    it('stores the legal type and keeps validating identifiers', async () => {
      expect((await get('/api/v1/company-settings')).json()).toMatchObject({
        legalType: 'individual',
        vatRegime: 'subject',
        vatExemptionMention: null,
      })
      const saved = await patchCompany({ legalType: 'sarl', ice: '001122334455667' })
      expect(saved.statusCode, saved.body).toBe(200)
      expect(saved.json().legalType).toBe('sarl')
      expect((await patchCompany({ ice: '123' })).statusCode).toBe(400)
      expect((await patchCompany({ legalType: 'llc' })).statusCode).toBe(400)
      expect(
        (await patchCompany({ registrationNumber: '12', registrationCity: null })).statusCode,
      ).toBe(400)
    })
    it('requires company_settings.read for the requirements reference', async () => {
      await fixture.client`delete from user_roles where user_id=${testUserId}`
      const denied = await get('/api/v1/company-settings/legal-requirements')
      expect(denied.statusCode).toBe(403)
    })
  })

  describe('restricted runtime role', () => {
    it('reads the reference, cannot change it and numbers the FS series', async () => {
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
        expect(
          (await runtime`select field from legal_type_requirements where legal_type='sarl'`).length,
        ).toBe(8)
        await expect(
          runtime`insert into legal_type_requirements values ('sarl','ice',false) on conflict do nothing`,
        ).rejects.toThrow(/permission denied/)
        await expect(
          runtime`update legal_type_requirements set required_for_legal_invoice=false`,
        ).rejects.toThrow(/permission denied/)
        await expect(runtime`delete from legal_type_requirements`).rejects.toThrow(
          /permission denied/,
        )
        const db = drizzle(runtime, { schema: tables })
        const a = await db.transaction((tx) => nextDocumentNumber(tx, 'FS', 'Africa/Casablanca'))
        const b = await db.transaction((tx) => nextDocumentNumber(tx, 'FS', 'Africa/Casablanca'))
        expect([a.number, b.number]).toEqual([`FS-${year}-000001`, `FS-${year}-000002`])
        await expect(
          db.transaction((tx) => nextDocumentNumber(tx, 'ZZ' as never, 'Africa/Casablanca')),
        ).rejects.toThrow()
      } finally {
        await runtime.end({ timeout: 2 })
      }
    })
  })

  it('keeps the simple invoice regenerable from its snapshot after the profile changes', async () => {
    const issued = (await issue((await draft()).id)).json()
    await fixture.client`update company_settings set legal_type='sarl', legal_name='Renamed' where id=1`
    const pdf = await post(`/api/v1/documents/invoice/${issued.id}/regenerate-pdf`, {
      design: 'saved',
    })
    expect(pdf.statusCode, pdf.body).toBe(200)
    expect(
      (
        await fixture.client`select kind, issuer_snapshot->>'legalName' as name from invoices where id=${issued.id}`
      )[0],
    ).toEqual({ kind: 'simple', name: 'Karim Alaoui' })
  })

  describe('review 5 fixes', () => {
    const estimateInput = (vatRate: string | null) => ({
      ...input(vatRate),
      dueDate: undefined,
      validUntil: '2026-10-20',
    })

    it('refuses VAT on estimates of an exempt company at create, update and issue', async () => {
      await fixture.client`update company_settings set vat_regime='exempt' where id=1`
      const refused = await post('/api/v1/estimates', estimateInput('20.00'))
      expect(refused.statusCode).toBe(400)
      expect(refused.json().code).toBe('VAT_EXEMPT_REGIME')
      // A draft taxed while the company was subject is caught at issue after the regime changed.
      await fixture.client`update company_settings set vat_regime='subject' where id=1`
      const taxed = await post('/api/v1/estimates', estimateInput('20.00'))
      expect(taxed.statusCode, taxed.body).toBe(201)
      await fixture.client`update company_settings set vat_regime='exempt' where id=1`
      const atIssue = await post(`/api/v1/estimates/${taxed.json().id}/issue`, {
        expectedVersion: taxed.json().version,
      })
      expect(atIssue.statusCode).toBe(400)
      expect(atIssue.json().code).toBe('VAT_EXEMPT_REGIME')
      const clean = await post('/api/v1/estimates', estimateInput(null))
      expect(clean.statusCode, clean.body).toBe(201)
    })

    it('refuses to convert a taxed accepted estimate once the company is exempt', async () => {
      const estimate = (await post('/api/v1/estimates', estimateInput('20.00'))).json()
      await post(`/api/v1/estimates/${estimate.id}/issue`, { expectedVersion: estimate.version })
      const accepted = await post(`/api/v1/estimates/${estimate.id}/accept`, {
        expectedVersion: estimate.version + 1,
      })
      expect(accepted.statusCode, accepted.body).toBe(200)
      await fixture.client`update company_settings set vat_regime='exempt' where id=1`
      const converted = await post(`/api/v1/estimates/${estimate.id}/invoices`, {
        operationId: '44444444-4444-4444-8444-444444444444',
        dueDate: '2026-12-31',
      })
      expect(converted.statusCode).toBe(400)
      expect(converted.json().code).toBe('VAT_EXEMPT_REGIME')
      expect((await fixture.client`select id from invoices`).length).toBe(0)
    })

    it('holds the company settings row lock while an invoice issue runs', async () => {
      const created = await draft()
      let released = false
      const holder = fixture.client.begin(async (tx) => {
        await tx`select id from company_settings where id=1 for update`
        await new Promise((resolve) => setTimeout(resolve, 600))
        released = true
      })
      await new Promise((resolve) => setTimeout(resolve, 150))
      const issued = await issue(created.id)
      await holder
      expect(issued.statusCode, issued.body).toBe(200)
      // The issue had to wait for the settings writer to finish.
      expect(released).toBe(true)
    })

    it('rejects an issued invoice without a kind and a draft with one', async () => {
      await expect(
        fixture.client`insert into invoices(number,status,client_id,issue_date,due_date,issuer_snapshot,client_snapshot,appearance_snapshot,issued_at) values('FAC-2026-888888','issued',${clientId},'2026-10-02','2026-10-03','{}','{}','{}',now())`,
      ).rejects.toThrow(/invoices_kind_issued/)
      await expect(
        fixture.client`insert into invoices(kind,status,client_id,issue_date,issuer_snapshot,client_snapshot,appearance_snapshot) values('simple','draft',${clientId},'2026-10-02','{}','{}','{}')`,
      ).rejects.toThrow(/invoices_kind/)
    })

    it('snapshots only the identifiers the legal type shows, keeping stored values', async () => {
      await fixture.client`update company_settings set ${fixture.client.unsafe(complete)}, legal_type='sarl' where id=1`
      await fixture.client`update company_settings set legal_type='individual' where id=1`
      const issued = (await issue((await draft()).id)).json()
      const snapshot = (
        await fixture.client`select issuer_snapshot from invoices where id=${issued.id}`
      )[0]!.issuer_snapshot
      expect(snapshot).toMatchObject({
        documentKind: 'simple',
        ice: null,
        taxIdentifier: null,
        registrationNumber: null,
        registrationCity: null,
        professionalTaxNumber: null,
        shareCapital: null,
      })
      // Stored values are untouched, so switching back to a registered type restores them.
      expect(
        (await fixture.client`select ice, registration_number from company_settings`)[0],
      ).toEqual({ ice: '001122334455667', registration_number: '998877' })
      await fixture.client`update company_settings set legal_type='auto_entrepreneur' where id=1`
      const legal = (await issue((await draft()).id)).json()
      const next = (
        await fixture.client`select issuer_snapshot from invoices where id=${legal.id}`
      )[0]!.issuer_snapshot
      expect(next).toMatchObject({
        ice: '001122334455667',
        taxIdentifier: '12345678',
        registrationNumber: null,
        shareCapital: null,
      })
    })

    it('does not give a delivery note the invoice document kind', async () => {
      const issued = (await issue((await draft()).id)).json()
      const note = await post(`/api/v1/invoices/${issued.id}/delivery-note`, {})
      expect(note.statusCode, note.body).toBeLessThan(300)
      const snapshot = (
        await fixture.client`select issuer_snapshot from delivery_notes where id=${note.json().id}`
      )[0]!.issuer_snapshot
      expect(snapshot).not.toHaveProperty('documentKind')
      expect(snapshot).toMatchObject({ legalType: 'individual' })
    })
  })
})
