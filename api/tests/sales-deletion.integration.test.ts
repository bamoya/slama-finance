import { randomUUID } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/env.js'
import type { SalesDeletionSelection } from '../src/contracts/generated/sales/actions.schemas.js'
import type { DeliveryNote } from '../src/contracts/generated/sales/delivery-notes.schemas.js'
import type { Estimate } from '../src/contracts/generated/sales/estimates.schemas.js'
import type { Invoice } from '../src/contracts/generated/sales/invoices.schemas.js'
import type { Payment } from '../src/contracts/generated/sales/payments.schemas.js'
import type { ObjectStorage } from '../src/integrations/contracts.js'
import { createPasswordService } from '../src/modules/organization/identity/auth/services/password.service.js'
import { createInvoiceRepository } from '../src/modules/organization/sales/invoices/repositories/invoice.repository.js'
import { createInvoiceOwnerAccess } from '../src/modules/organization/sales/invoices/services/invoice.service.js'
import { createArtifactCleanup, createArtifactSupport } from '../src/support/artifacts/index.js'
import { createJobSupport } from '../src/support/jobs/index.js'
import { attachTestDatabase, isolatedDatabase, testUserId } from './helpers/postgres.js'

const clientId = '33333333-3333-4333-8333-333333333333'
const headers = {
  origin: 'http://localhost:5173',
  'x-organization-id': '10000000-0000-4000-8000-000000000001',
}
describe('Impact-confirmed sales deletion', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let app: Awaited<ReturnType<typeof buildApp>>
  let cookies: { slama_session: string }
  let storage: ObjectStorage
  let failStorage: boolean
  const objects = new Set<string>()
  const removeObject = vi.fn()
  const post = (url: string, payload: object) =>
    app.inject({ method: 'POST', url, headers, cookies, payload })
  const selection = (
    resource: SalesDeletionSelection['resource'],
    rows: { id: string; version: number }[],
    cascadeInvoices = false,
  ): SalesDeletionSelection => ({
    resource,
    records: rows.map((row) => ({ id: row.id, expectedVersion: row.version })),
    cascadeInvoices,
  })
  async function preview(input: SalesDeletionSelection) {
    const response = await post('/api/v1/sales/deletion/preview', input)
    expect(response.statusCode, response.body).toBe(200)
    return response.json()
  }
  async function remove(input: SalesDeletionSelection) {
    const impact = await preview(input)
    const response = await post('/api/v1/sales/deletion', { ...input, token: impact.token })
    expect(response.statusCode, response.body).toBe(204)
    return impact
  }
  beforeEach(async () => {
    fixture = await isolatedDatabase()
    objects.clear()
    removeObject.mockReset()
    failStorage = false
    storage = {
      async putImmutable(input) {
        objects.add(input.key)
        return {
          key: input.key,
          contentType: input.contentType,
          byteSize: input.bytes.length,
          sha256: 'a'.repeat(64),
        }
      },
      async get() {
        return Buffer.from('%PDF-test')
      },
      async signedDownloadUrl() {
        throw new Error('Not used')
      },
      async list() {
        return [...objects].map((key) => ({
          key,
          lastModified: new Date('2020-01-01'),
          byteSize: 9,
        }))
      },
      async deleteUnreferenced(key) {
        removeObject(key)
        if (failStorage) throw new Error('Storage unavailable')
        objects.delete(key)
      },
    }
    await fixture.client`update company_settings set legal_name='Slama',address_line1='Rue Atlas',city='Rabat' where id=1`
    await fixture.client`insert into clients(id,type,legal_name,address_line1,city,email) values(${clientId},'company','Atlas','Rue Atlas','Rabat','client@example.test')`
    const hash = await createPasswordService().hash('deletion-test-password')
    await fixture.client`update users set password_hash=${hash} where id=${testUserId}`
    await fixture.client`insert into user_roles(user_id,role_id) select ${testUserId},id from roles where key='admin'`
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
      payload: { email: 'operator@example.test', password: 'deletion-test-password' },
    })
    expect(login.statusCode).toBe(200)
    cookies = { slama_session: login.cookies[0]!.value }
  })
  afterEach(async () => {
    await app?.close()
    await fixture?.cleanup()
  })
  const base = () => ({
    clientId,
    templateId: null,
    issueDate: '2026-10-02',
    notes: null,
    paymentTerms: null,
    lines: [
      {
        productVariantId: null,
        productName: 'Wheat',
        quantity: 10,
        unitPrice: '20.00',
        vatRate: null,
      },
    ],
  })
  async function estimate() {
    const created = await post('/api/v1/estimates', { ...base(), validUntil: null })
    expect(created.statusCode, created.body).toBe(201)
    const issued = await post(`/api/v1/estimates/${created.json().id}/issue`, {
      expectedVersion: 1,
    })
    expect(issued.statusCode, issued.body).toBe(200)
    const accepted = await post(`/api/v1/estimates/${created.json().id}/accept`, {
      expectedVersion: issued.json().version,
    })
    expect(accepted.statusCode, accepted.body).toBe(200)
    return accepted.json<Estimate>()
  }
  async function invoice(source?: Estimate, issue = true, operationId = randomUUID()) {
    const created = source
      ? await post(`/api/v1/estimates/${source.id}/invoices`, { operationId, dueDate: null })
      : await post('/api/v1/invoices', { ...base(), dueDate: null })
    expect(created.statusCode, created.body).toBe(201)
    if (!issue) return created.json<Invoice>()
    const issued = await post(`/api/v1/invoices/${created.json().id}/issue`, { expectedVersion: 1 })
    expect(issued.statusCode, issued.body).toBe(200)
    return issued.json<Invoice>()
  }
  async function payment(owner: Invoice) {
    const result = await post('/api/v1/payments', {
      operationId: randomUUID(),
      invoiceId: owner.id,
      amount: '40.00',
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
    expect(result.statusCode, result.body).toBe(201)
    return result.json<Payment>()
  }
  async function delivery(owner: Invoice) {
    const result = await post(`/api/v1/invoices/${owner.id}/delivery-note`, {})
    expect(result.statusCode, result.body).toBe(201)
    return result.json<DeliveryNote>()
  }
  async function file(type: string, id: string, version = 1) {
    const key = `organizations/10000000-0000-4000-8000-000000000001/artifacts/${type}/${randomUUID()}.pdf`
    objects.add(key)
    await fixture.client`insert into document_artifacts(document_type,document_id,source_version,format,object_key,mime_type,byte_size,sha256) values(${type},${id},${version},'pdf',${key},'application/pdf',9,${'a'.repeat(64)})`
    return key
  }
  async function message(owner: Invoice, key: string, sending = false) {
    const [row] =
      await fixture.client`insert into outbound_messages(to_address,from_email,from_name,subject,html,text_body,idempotency_key,payload_hash) values('client@example.test','sender@example.test','Slama','Invoice','Body','Body',${randomUUID()},${'a'.repeat(64)}) returning id`
    await fixture.client`insert into outbound_message_attachments(message_id,object_key,filename,content_type,byte_size,position) values(${row!.id},${key},'invoice.pdf','application/pdf',9,0)`
    await fixture.client`insert into notification_dispatches(source_type,source_id,event_key,occurrence_key,logical_occurrence_key,message_id) values('invoice',${owner.id},'invoice_sent',${randomUUID()},${randomUUID()},${row!.id})`
    if (sending)
      await fixture.client`update outbound_messages set status='sending',lease_token=${randomUUID()},locked_until=now()+interval '1 minute' where id=${row!.id}`
    return row!.id as string
  }
  /** Privileged purge as a future organization teardown would do it: the only way to remove numbered rows. */
  const teardown = <T>(work: (tx: typeof fixture.client) => Promise<T>) =>
    fixture.client.begin(async (tx) => {
      await tx`select set_config('app.sales_teardown','on',true)`
      return work(tx as unknown as typeof fixture.client)
    })
  async function deleteEntity(path: string, input: object) {
    const preview = await post(`${path}/preview`, input)
    expect(preview.statusCode, preview.body).toBe(200)
    const result = await post(path, { ...input, token: preview.json().token })
    expect(result.statusCode, result.body).toBe(204)
    return preview.json()
  }
  it('preserves issued client identities and leaves detached invoice drafts issuable', async () => {
    const issued = await invoice()
    const draft = await invoice(undefined, false)
    await fixture.client`update clients set legal_name='Updated identity' where id=${clientId}`
    await deleteEntity('/api/v1/clients/deletion', {
      records: [{ id: clientId, expectedVersion: 1 }],
      cascadeDocuments: false,
    })
    const kept = await app.inject({ url: `/api/v1/invoices/${issued.id}`, cookies })
    expect(kept.statusCode, kept.body).toBe(200)
    expect(kept.json().clientId).toBeNull()
    expect(kept.json().clientDisplayName).toBe('Atlas')
    const drafts = await app.inject({ url: `/api/v1/invoices/${draft.id}`, cookies })
    expect(drafts.json().clientDisplayName).toBe('Updated identity')
    const published = await post(`/api/v1/invoices/${draft.id}/issue`, {
      expectedVersion: drafts.json().version,
    })
    expect(published.statusCode, published.body).toBe(200)
    const listed = await app.inject({ url: '/api/v1/invoices', cookies })
    expect(listed.json().items).toHaveLength(2)
    const invalid = await post('/api/v1/invoices', { ...base(), clientId: null, dueDate: null })
    expect(invalid.statusCode).toBe(400)
  })
  it('cascades client-owned draft chains only after explicit confirmation', async () => {
    const draft = await post('/api/v1/estimates', { ...base(), validUntil: null })
    expect(draft.statusCode, draft.body).toBe(201)
    await invoice(undefined, false)
    await deleteEntity('/api/v1/clients/deletion', {
      records: [{ id: clientId, expectedVersion: 1 }],
      cascadeDocuments: true,
    })
    for (const table of ['clients', 'estimates', 'invoices', 'delivery_notes', 'payments']) {
      expect(
        (await fixture.client.unsafe(`select count(*)::integer as n from ${table}`))[0]!.n,
      ).toBe(0)
    }
  })
  it('refuses to cascade-delete a client that owns numbered documents and keeps the chain intact', async () => {
    const source = await estimate()
    const owner = await invoice(source)
    await payment(owner)
    const input = {
      records: [{ id: clientId, expectedVersion: 1 }],
      cascadeDocuments: true,
    }
    const impact = await post('/api/v1/clients/deletion/preview', input)
    expect(impact.statusCode, impact.body).toBe(200)
    expect(impact.json().blockers).toContain('NUMBERED_DOCUMENTS')
    const refused = await post('/api/v1/clients/deletion', { ...input, token: impact.json().token })
    expect(refused.statusCode).toBe(409)
    expect(refused.json().code).toBe('NUMBERED_DOCUMENTS')
    for (const table of ['clients', 'estimates', 'invoices', 'payments'])
      expect(
        (await fixture.client.unsafe(`select count(*)::integer as n from ${table}`))[0]!.n,
      ).toBe(1)
  })
  it('rejects stale client impact without deleting any selected client', async () => {
    const input = { records: [{ id: clientId, expectedVersion: 1 }], cascadeDocuments: true }
    const preview = await post('/api/v1/clients/deletion/preview', input)
    expect(preview.statusCode, preview.body).toBe(200)
    await invoice(undefined, false)
    const result = await post('/api/v1/clients/deletion', { ...input, token: preview.json().token })
    expect(result.statusCode, result.body).toBe(409)
    expect(await fixture.client`select id from clients where id=${clientId}`).toHaveLength(1)
  })
  it('uncategorises products by default and removes their variants only with cascade', async () => {
    const category = randomUUID(),
      product = randomUUID(),
      variant = randomUUID()
    await fixture.client`insert into product_categories(id,name) values(${category},'Grain')`
    await fixture.client.begin(async (tx) => {
      await tx`insert into products(id,name,reference,category_id) values(${product},'Wheat','WH-1',${category})`
      await tx`insert into product_variants(id,product_id,weight_g,price_per_item) values(${variant},${product},500,20)`
    })
    await deleteEntity('/api/v1/catalog/deletion', {
      resource: 'categories',
      records: [{ id: category, expectedVersion: 1 }],
      cascadeProducts: false,
    })
    expect(
      (await fixture.client`select category_id from products where id=${product}`)[0]!.category_id,
    ).toBeNull()
    expect(await fixture.client`select id from product_variants where id=${variant}`).toHaveLength(
      1,
    )
    await deleteEntity('/api/v1/catalog/deletion', {
      resource: 'products',
      records: [{ id: product, expectedVersion: 2 }],
      cascadeProducts: false,
    })
    expect(await fixture.client`select id from product_variants where id=${variant}`).toHaveLength(
      0,
    )
  })
  it('preserves product line snapshots and rejects a changed catalogue preview', async () => {
    const product = randomUUID(),
      variant = randomUUID()
    await fixture.client.begin(async (tx) => {
      await tx`insert into products(id,name,reference) values(${product},'Wheat','WH-1')`
      await tx`insert into product_variants(id,product_id,weight_g,price_per_item) values(${variant},${product},500,20)`
    })
    const created = await post('/api/v1/invoices', {
      ...base(),
      dueDate: null,
      lines: [{ ...base().lines[0], productVariantId: variant }],
    })
    expect(created.statusCode, created.body).toBe(201)
    const issued = await post(`/api/v1/invoices/${created.json().id}/issue`, { expectedVersion: 1 })
    expect(issued.statusCode, issued.body).toBe(200)
    const original = issued.json<Invoice>()
    const input = {
      resource: 'products',
      records: [{ id: product, expectedVersion: 1 }],
      cascadeProducts: false,
    }
    const preview = await post('/api/v1/catalog/deletion/preview', input)
    expect(preview.statusCode, preview.body).toBe(200)
    await fixture.client`update product_variants set price_per_item=25 where id=${variant}`
    const stale = await post('/api/v1/catalog/deletion', { ...input, token: preview.json().token })
    expect(stale.statusCode).toBe(409)
    await deleteEntity('/api/v1/catalog/deletion', input)
    const kept = await app.inject({ url: `/api/v1/invoices/${original.id}`, cookies })
    expect(kept.statusCode, kept.body).toBe(200)
    expect(kept.json().contentVersion).toBe(original.contentVersion)
    expect(kept.json().lines[0]).toMatchObject({
      productId: null,
      productVariantId: null,
      productName: 'Wheat',
      packageWeightG: 500,
      unitPrice: '20.00',
      quantity: 10,
    })
  })
  it('rejects an entire client cascade batch without child delete permission', async () => {
    await invoice()
    await fixture.client`delete from role_permissions where permission_id in (select id from permissions where key='invoices.delete')`
    const result = await post('/api/v1/clients/deletion/preview', {
      records: [{ id: clientId, expectedVersion: 1 }],
      cascadeDocuments: true,
    })
    expect(result.statusCode).toBe(403)
    expect(await fixture.client`select id from clients where id=${clientId}`).toHaveLength(1)
    expect(await fixture.client`select id from invoices`).toHaveLength(1)
  })
  it('clears bank defaults and references without changing issued snapshots or payment history', async () => {
    const [bank] =
      await fixture.client`insert into bank_accounts(name,bank_name,account_holder,rib) values('Main','Credit Agricole','Slama','225091032701984651012213') returning id`
    await fixture.client`update company_settings set default_bank_account_id=${bank!.id} where id=1`
    const owner = await invoice()
    const recorded = await post('/api/v1/payments', {
      operationId: randomUUID(),
      invoiceId: owner.id,
      amount: '40.00',
      currency: 'MAD',
      method: 'bank_transfer',
      status: 'confirmed',
      paymentDate: '2026-10-02',
      collectedOn: '2026-10-02',
      bankAccountId: bank!.id,
      reference: null,
      chequeBank: null,
      chequeNumber: null,
    })
    expect(recorded.statusCode, recorded.body).toBe(201)
    const impact = await deleteEntity('/api/v1/settings/deletion', {
      resource: 'bank_accounts',
      records: [{ id: bank!.id, expectedVersion: 1 }],
    })
    expect(
      impact.groups.some((group: { resource: string }) => group.resource === 'company_settings'),
    ).toBe(true)
    const kept = await app.inject({ url: `/api/v1/invoices/${owner.id}`, cookies })
    expect(kept.statusCode, kept.body).toBe(200)
    expect(kept.json().bankAccountId).toBeNull()
    expect(kept.json().bankDetailsSnapshot).toEqual(owner.bankDetailsSnapshot)
    expect(kept.json().contentVersion).toBe(owner.contentVersion)
    const payment = await app.inject({ url: `/api/v1/payments/${recorded.json().id}`, cookies })
    expect(payment.json()).toMatchObject({
      bankAccountId: null,
      bankAccountSnapshot: { bankName: 'Credit Agricole' },
      status: 'confirmed',
    })
    expect(
      (await fixture.client`select default_bank_account_id from company_settings`)[0]!
        .default_bank_account_id,
    ).toBeNull()
  })
  it('deletes a default template while retaining issued designs and rejecting stale impact', async () => {
    const [template] =
      await fixture.client`insert into document_templates(name,layout,accent_color) values('Chosen','atelier','#176c51') returning id`
    await fixture.client`update company_settings set default_template_id=${template!.id} where id=1`
    const owner = await invoice()
    const input = { resource: 'templates', records: [{ id: template!.id, expectedVersion: 1 }] }
    const [frozen] =
      await fixture.client`select appearance_snapshot from invoices where id=${owner.id}`
    const preview = await post('/api/v1/settings/deletion/preview', input)
    expect(preview.statusCode, preview.body).toBe(200)
    await invoice(undefined, false)
    const stale = await post('/api/v1/settings/deletion', { ...input, token: preview.json().token })
    expect(stale.statusCode).toBe(409)
    await deleteEntity('/api/v1/settings/deletion', input)
    const kept = await app.inject({ url: `/api/v1/invoices/${owner.id}`, cookies })
    expect(kept.json().templateId).toBeNull()
    expect(
      (await fixture.client`select appearance_snapshot from invoices where id=${owner.id}`)[0]!
        .appearance_snapshot,
    ).toEqual(frozen!.appearance_snapshot)
    expect(kept.json().contentVersion).toBe(owner.contentVersion)
    expect(
      (await fixture.client`select default_template_id from company_settings`)[0]!
        .default_template_id,
    ).toBeNull()
  })
  it('cancels billed delivery notes without cancelling their invoice or payment', async () => {
    const owner = await invoice(),
      paid = await payment(owner),
      note = await delivery(owner)
    const delivered = await post(`/api/v1/delivery-notes/${note.id}/deliver`, {
      expectedVersion: note.version,
      receivedByName: null,
    })
    expect(delivered.statusCode, delivered.body).toBe(200)
    await fixture.client`insert into delivery_invoice_allocations(delivery_note_line_id, invoice_line_id, quantity) values(${note.lines[0]!.id}, ${owner.lines[0]!.id}, 10)`
    const input = {
      resource: 'delivery_notes',
      records: [{ id: note.id, expectedVersion: delivered.json().version }],
    }
    const preview = await post('/api/v1/sales/cancellation/preview', input)
    expect(preview.statusCode, preview.body).toBe(200)
    const result = await post('/api/v1/sales/cancellation', {
      ...input,
      token: preview.json().token,
      reason: 'Delivery cancelled',
    })
    expect(result.statusCode, result.body).toBe(204)
    expect(
      await fixture.client`select delivery_note_line_id from delivery_invoice_allocations where delivery_note_line_id=${note.lines[0]!.id}`,
    ).toHaveLength(1)
    expect(
      (await fixture.client`select status from invoices where id=${owner.id}`)[0]!.status,
    ).toBe('issued')
    expect((await fixture.client`select status from payments where id=${paid.id}`)[0]!.status).toBe(
      'confirmed',
    )
  })
  it('rejects the whole cancellation batch if one record is stale or ineligible', async () => {
    const source = await estimate(),
      draft = await post('/api/v1/estimates', { ...base(), validUntil: null })
    const input = {
      resource: 'estimates',
      records: [
        { id: source.id, expectedVersion: source.version },
        { id: draft.json().id, expectedVersion: 1 },
      ],
    }
    const result = await post('/api/v1/sales/cancellation/preview', input)
    expect(result.statusCode).toBe(409)
    expect(
      (await fixture.client`select status from estimates where id=${source.id}`)[0]!.status,
    ).toBe('accepted')
  })
  it('cancels payments atomically and recalculates balances without cancelling their invoice', async () => {
    const owner = await invoice(),
      first = await payment(owner),
      second = await payment(owner)
    const input = {
      resource: 'payments',
      records: [
        { id: first.id, expectedVersion: first.version },
        { id: second.id, expectedVersion: second.version },
      ],
    }
    const preview = await post('/api/v1/sales/cancellation/preview', input)
    expect(preview.statusCode, preview.body).toBe(200)
    await fixture.client`update payments set version=version+1 where id=${second.id}`
    const stale = await post('/api/v1/sales/cancellation', {
      ...input,
      token: preview.json().token,
      reason: 'Correction',
    })
    expect(stale.statusCode).toBe(409)
    expect(
      (await fixture.client`select status from payments where id=${first.id}`)[0]!.status,
    ).toBe('confirmed')
    input.records[1]!.expectedVersion++
    const updated = await post('/api/v1/sales/cancellation/preview', input)
    const result = await post('/api/v1/sales/cancellation', {
      ...input,
      token: updated.json().token,
      reason: 'Correction',
    })
    expect(result.statusCode, result.body).toBe(204)
    const kept = await app.inject({ url: `/api/v1/invoices/${owner.id}`, cookies })
    expect(kept.json()).toMatchObject({
      status: 'issued',
      paidAmount: '0.00',
      availableBalance: '200.00',
    })
  })
  it('cancels estimates without changing their invoices, payments or delivery notes', async () => {
    const source = await estimate(),
      owner = await invoice(source),
      paid = await payment(owner),
      note = await delivery(owner)
    const input = {
      resource: 'estimates',
      records: [{ id: source.id, expectedVersion: source.version }],
    }
    const preview = await post('/api/v1/sales/cancellation/preview', input)
    const result = await post('/api/v1/sales/cancellation', {
      ...input,
      token: preview.json().token,
      reason: 'Estimate withdrawn',
    })
    expect(result.statusCode, result.body).toBe(204)
    expect(
      (await fixture.client`select status from estimates where id=${source.id}`)[0]!.status,
    ).toBe('cancelled')
    expect(
      (await fixture.client`select status from invoices where id=${owner.id}`)[0]!.status,
    ).toBe('issued')
    expect((await fixture.client`select status from payments where id=${paid.id}`)[0]!.status).toBe(
      'confirmed',
    )
    expect(
      (await fixture.client`select status from delivery_notes where id=${note.id}`)[0]!.status,
    ).toBe('draft')
  })
  it('removes staff access while retaining immutable historical attribution', async () => {
    const id = randomUUID()
    await fixture.client`insert into users(id,email,first_name,password_hash,must_change_password) values(${id},'staff@example.test','Staff','hash',false)`
    await fixture.client`insert into audit_events(actor_id,actor_kind,action,entity_table,entity_key) values(${id},'user','create','clients',${JSON.stringify({ id: clientId })}::jsonb)`
    await deleteEntity('/api/v1/staff/deletion', { ids: [id] })
    const [user] =
      await fixture.client`select email,first_name,disabled_at,deleted_at from users where id=${id}`
    expect(user!.first_name).toBe('Deleted user')
    expect(user!.email).not.toBe('staff@example.test')
    expect(user!.deleted_at).not.toBeNull()
    expect(await fixture.client`select id from audit_events where actor_id=${id}`).toHaveLength(1)
    expect((await app.inject({ url: `/api/v1/staff/${id}`, cookies })).statusCode).toBe(404)
    const self = await post('/api/v1/staff/deletion/preview', { ids: [testUserId] })
    expect(self.statusCode).toBe(409)
  })
  it('fences a running PDF worker when its owner is deleted during storage I/O', async () => {
    const owner = await invoice()
    const jobs = createJobSupport(() => fixture.db)
    const job = await jobs.claim()
    expect(job?.jobType).toBe('prepare_pdf')
    const access = createInvoiceOwnerAccess(createInvoiceRepository(() => fixture.db))
    const artifacts = createArtifactSupport(() => fixture.db, storage, {
      assertPublishable: (tx, _type, id, version) => access.assertPublishable(tx, id, version),
      assertReadable: (tx, _type, id, actor) => access.assertReadable(tx, id, actor),
    })
    const put = storage.putImmutable.bind(storage)
    vi.spyOn(storage, 'putImmutable').mockImplementationOnce(async (input) => {
      const result = await put(input)
      await teardown(async (tx) => {
        await tx`update background_jobs set status='cancelled',lease_token=null,last_error_code='OWNER_DELETED',payload='{}'::jsonb`
        await tx`delete from invoices where id=${owner.id}`
      })
      return result
    })
    await expect(
      artifacts.service.publishPdf({
        type: 'invoice',
        documentId: owner.id,
        sourceVersion: owner.contentVersion,
        actor: testUserId,
        bytes: Buffer.from('%PDF-test'),
      }),
    ).rejects.toMatchObject({ code: 'INVOICE_NOT_FOUND' })
    await expect(jobs.complete(job!)).rejects.toMatchObject({ code: 'STALE_JOB_LEASE' })
    expect((await fixture.client`select count(*) from document_artifacts`)[0]!.count).toBe('0')
    expect(objects.size).toBe(0)
  })
  it('deletes a bulk graph once and preserves it completely when any child deletion fails', async () => {
    const first = await invoice(undefined, false)
    const second = await invoice(undefined, false)
    const input = selection('invoices', [first, second])
    const impact = await preview(input)
    expect(impact.groups.map((group: { records: unknown[] }) => group.records.length)).toEqual([2])
    await fixture.client.unsafe(
      `create function reject_invoice_deletion() returns trigger language plpgsql as $$ begin raise exception 'test rollback'; end $$; create trigger reject_invoice_deletion before delete on invoices for each row execute function reject_invoice_deletion();`,
    )
    expect(
      (await post('/api/v1/sales/deletion', { ...input, token: impact.token })).statusCode,
    ).toBe(500)
    expect((await fixture.client`select count(*) from invoices`)[0]!.count).toBe('2')
    expect(
      (await fixture.client`select count(*) from audit_events where action='delete'`)[0]!.count,
    ).toBe('0')
    await fixture.client.unsafe('drop trigger reject_invoice_deletion on invoices')
    const removed = await remove(input)
    expect(removed.groups.map((group: { records: unknown[] }) => group.records.length)).toEqual([2])
    expect((await fixture.client`select count(*) from invoices`)[0]!.count).toBe('0')
    expect(
      (await fixture.client`select count(*) from audit_events where action='delete'`)[0]!.count,
    ).toBe('2')
  })
  it('deletes draft invoice chains and exclusive files while preserving clients and unrelated records', async () => {
    const owner = await invoice(undefined, false)
    const unrelated = await invoice(undefined, false)
    const key = await file('invoice', owner.id, owner.contentVersion)
    await fixture.client`insert into background_jobs(job_type,payload,idempotency_key,status,lease_token,locked_until) values('prepare_pdf',${JSON.stringify({ documentType: 'invoice', documentId: owner.id })}::jsonb,${randomUUID()},'running',${randomUUID()},now()+interval '1 minute')`
    await message(owner, key)
    const impact = await remove(selection('invoices', [owner]))
    expect(impact.groups.map((group: { resource: string }) => group.resource)).toEqual(['invoices'])
    expect(impact).toMatchObject({ files: 1, jobs: 1, emails: 1, blockers: [] })
    expect((await fixture.client`select id from invoices where id=${owner.id}`).length).toBe(0)
    expect((await fixture.client`select id from invoices where id=${unrelated.id}`).length).toBe(1)
    expect((await fixture.client`select id from clients where id=${clientId}`).length).toBe(1)
    expect(
      (
        await fixture.client`select status,lease_token,payload from background_jobs where last_error_code='OWNER_DELETED'`
      )[0],
    ).toMatchObject({ status: 'cancelled', lease_token: null, payload: {} })
    expect(objects.has(key)).toBe(false)
    expect(
      (await fixture.client`select count(*) from audit_events where action='delete'`)[0]!.count,
    ).toBe('1')
  })
  it('refuses to delete numbered documents and payments, from the bulk action and the database', async () => {
    const source = await estimate()
    const owner = await invoice(source)
    const note = await delivery(owner)
    const paid = await payment(owner)
    const delivered = await post(`/api/v1/delivery-notes/${note.id}/deliver`, {
      expectedVersion: note.version,
      receivedByName: null,
    })
    expect(delivered.statusCode, delivered.body).toBe(200)
    const numberedNote = delivered.json<DeliveryNote>()
    const targets = [
      selection('invoices', [owner]),
      selection('estimates', [source]),
      selection('estimates', [source], true),
      selection('delivery_notes', [numberedNote]),
      selection('payments', [paid]),
    ]
    for (const input of targets) {
      const impact = await preview(input)
      expect(impact.blockers, input.resource).toContain('NUMBERED_DOCUMENTS')
      const refused = await post('/api/v1/sales/deletion', { ...input, token: impact.token })
      expect(refused.statusCode, refused.body).toBe(409)
      expect(refused.json().code).toBe('NUMBERED_DOCUMENTS')
    }
    const single = await app.inject({
      method: 'DELETE',
      url: `/api/v1/payments/${paid.id}`,
      headers,
      cookies,
      payload: { expectedVersion: paid.version },
    })
    expect(single.statusCode, single.body).toBe(409)
    expect(single.json().code).toBe('PAYMENT_NOT_DELETABLE')
    for (const table of ['estimates', 'invoices', 'delivery_notes', 'payments'])
      expect(
        (await fixture.client.unsafe(`select count(*)::integer as n from ${table}`))[0]!.n,
      ).toBe(1)
    // Defence in depth: the database itself refuses, even for the owner role, without the teardown flag.
    for (const table of ['payments', 'delivery_notes', 'estimates'])
      await expect(fixture.client.unsafe(`delete from ${table}`)).rejects.toThrow(
        /cannot be deleted/,
      )
    await expect(fixture.client`delete from invoices where id=${owner.id}`).rejects.toThrow(
      /cannot be deleted/,
    )
    // Cancellation remains the correction path.
    const cancelled = await post('/api/v1/sales/cancellation/preview', {
      resource: 'payments',
      records: [{ id: paid.id, expectedVersion: paid.version }],
    })
    expect(cancelled.statusCode, cancelled.body).toBe(200)
  })
  it('does not delete an issued estimate, so its invoices and revisions are never detached by deletion', async () => {
    const source = await estimate()
    const preserved = await invoice(source, false)
    const revision = await post(`/api/v1/estimates/${source.id}/revisions`, {
      expectedVersion: source.version,
    })
    expect(revision.statusCode, revision.body).toBe(200)
    const impact = await preview(selection('estimates', [source]))
    expect(impact.groups.map((group: { operation: string }) => group.operation)).toEqual([
      'delete',
      'detach',
      'detach',
    ])
    expect(impact.blockers).toEqual(['NUMBERED_DOCUMENTS'])
    const refused = await post('/api/v1/sales/deletion', {
      ...selection('estimates', [source]),
      token: impact.token,
    })
    expect(refused.statusCode).toBe(409)
    const current = (
      await app.inject({ url: `/api/v1/invoices/${preserved.id}`, cookies })
    ).json<Invoice>()
    expect(current).toMatchObject({ sourceEstimateId: source.id, status: 'draft' })
    expect(
      (
        await fixture.client`select revision_of_id from estimates where id=${revision.json().id}`
      )[0],
    ).toMatchObject({ revision_of_id: source.id })
  })
  it('requires an explicit cascade, binds the checkbox to its preview and still refuses numbered invoices', async () => {
    const source = await estimate()
    await invoice(source)
    await invoice(source)
    const input = selection('estimates', [source])
    const impact = await preview(input)
    expect(
      (
        await post('/api/v1/sales/deletion', {
          ...input,
          cascadeInvoices: true,
          token: impact.token,
        })
      ).statusCode,
    ).toBe(409)
    const cascade = await preview({ ...input, cascadeInvoices: true })
    expect(
      cascade.groups.find((group: { resource: string }) => group.resource === 'invoices').records,
    ).toHaveLength(2)
    expect(cascade.blockers).toEqual(['NUMBERED_DOCUMENTS'])
    const refused = await post('/api/v1/sales/deletion', {
      ...input,
      cascadeInvoices: true,
      token: cascade.token,
    })
    expect(refused.statusCode).toBe(409)
    expect(refused.json().code).toBe('NUMBERED_DOCUMENTS')
    expect((await fixture.client`select count(*) from invoices`)[0]!.count).toBe('2')
  })
  it('deletes a draft billed BL without deleting invoice lines or payments; payments are never deletable', async () => {
    const owner = await invoice()
    const note = await delivery(owner)
    const paid = await payment(owner)
    await fixture.client`insert into delivery_invoice_allocations(invoice_line_id,delivery_note_line_id,quantity) values(${owner.lines[0]!.id},${note.lines[0]!.id},1)`
    await remove(selection('delivery_notes', [note]))
    expect(
      (await fixture.client`select count(*) from delivery_invoice_allocations`)[0]!.count,
    ).toBe('0')
    expect(
      (
        await fixture.client`select quantity,product_name from invoice_lines where invoice_id=${owner.id}`
      )[0],
    ).toMatchObject({ quantity: 10, product_name: 'Wheat' })
    const refused = await preview(selection('payments', [paid]))
    expect(refused.blockers).toEqual(['NUMBERED_DOCUMENTS'])
    const current = (
      await app.inject({ url: `/api/v1/invoices/${owner.id}`, cookies })
    ).json<Invoice>()
    expect(current).toMatchObject({
      status: 'issued',
      paidAmount: '40.00',
      outstandingAmount: '160.00',
    })
  })
  it('rejects stale or unauthorized whole batches and prevents duplicate or missing selections', async () => {
    const first = await invoice()
    const second = await invoice()
    const input = selection('invoices', [first, second])
    const original = await preview(input)
    await payment(second)
    expect(
      (await post('/api/v1/sales/deletion', { ...input, token: original.token })).statusCode,
    ).toBe(409)
    const fresh = await preview(input)
    await fixture.client`delete from role_permissions where role_id in (select id from roles where key='admin') and permission_id in (select id from permissions where key='payments.delete')`
    expect(
      (await post('/api/v1/sales/deletion', { ...input, token: fresh.token })).statusCode,
    ).toBe(403)
    expect((await fixture.client`select count(*) from invoices`)[0]!.count).toBe('2')
    expect(
      (
        await post(
          '/api/v1/sales/deletion/preview',
          selection('invoices', [first, { ...first, id: first.id.toUpperCase() }]),
        )
      ).statusCode,
    ).toBe(400)
    expect(
      (
        await post(
          '/api/v1/sales/deletion/preview',
          selection('invoices', [first, { id: randomUUID(), version: 1 }]),
        )
      ).statusCode,
    ).toBe(404)
    expect(
      (await post('/api/v1/sales/deletion/preview', selection('invoices', [first], true)))
        .statusCode,
    ).toBe(400)
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/sales/deletion/preview',
          headers,
          payload: selection('invoices', [first]),
        })
      ).statusCode,
    ).toBe(403)
  })
  it('preserves shared attachments, blocks in-flight mail and retries storage cleanup after commit', async () => {
    const owner = await invoice(undefined, false)
    const other = await invoice(undefined, false)
    const shared = await file('invoice', owner.id, owner.contentVersion)
    const ownMessage = await message(owner, shared, true)
    await message(other, shared)
    const input = selection('invoices', [owner])
    const blocked = await preview(input)
    expect(blocked).toMatchObject({
      blockers: ['EMAIL_DELIVERY_IN_PROGRESS'],
      retainedFiles: 1,
      files: 0,
    })
    expect(
      (await post('/api/v1/sales/deletion', { ...input, token: blocked.token })).statusCode,
    ).toBe(409)
    await fixture.client`update outbound_messages set status='failed',lease_token=null,locked_until=null where id=${ownMessage}`
    await remove(input)
    expect(objects.has(shared)).toBe(true)
    const exclusive = await file('invoice', other.id, other.contentVersion)
    failStorage = true
    await remove(selection('invoices', [other]))
    expect(objects.has(exclusive)).toBe(true)
    expect((await fixture.client`select count(*) from document_artifacts`)[0]!.count).toBe('0')
    failStorage = false
    const result = await createArtifactCleanup(() => fixture.db, storage)(new Date())
    expect(result.failed).toBe(0)
    expect(objects.size).toBe(0)
  })
  it('rolls back children, work and audits on failure, then applies a concurrent confirmation only once', async () => {
    const owner = await invoice(undefined, false)
    const key = await file('invoice', owner.id, owner.contentVersion)
    const input = selection('invoices', [owner])
    const impact = await preview(input)
    await fixture.client.unsafe(
      `create function reject_invoice_deletion() returns trigger language plpgsql as $$ begin raise exception 'test rollback'; end $$; create trigger reject_invoice_deletion before delete on invoices for each row execute function reject_invoice_deletion();`,
    )
    expect(
      (await post('/api/v1/sales/deletion', { ...input, token: impact.token })).statusCode,
    ).toBe(500)
    expect(
      (await fixture.client`select id from invoice_lines where invoice_id=${owner.id}`).length,
    ).toBe(1)
    expect(
      (await fixture.client`select count(*) from audit_events where action='delete'`)[0]!.count,
    ).toBe('0')
    expect(removeObject).not.toHaveBeenCalled()
    expect(objects.has(key)).toBe(true)
    await fixture.client.unsafe('drop trigger reject_invoice_deletion on invoices')
    const fresh = await preview(input)
    const request = { ...input, token: fresh.token }
    const outcomes = await Promise.all([
      post('/api/v1/sales/deletion', request),
      post('/api/v1/sales/deletion', request),
    ])
    expect(outcomes.map((row) => row.statusCode).sort()).toEqual([204, 404])
    expect(
      (
        await fixture.client`select count(*) from audit_events where action='delete' and entity_table='invoices'`
      )[0]!.count,
    ).toBe('1')
  })
  it('does not recreate a deleted conversion on retry, and an issued revision cannot be deleted', async () => {
    const source = await estimate()
    const operationId = randomUUID()
    const owner = await invoice(source, false, operationId)
    await remove(selection('invoices', [owner]))
    const retry = await post(`/api/v1/estimates/${source.id}/invoices`, {
      operationId,
      dueDate: null,
    })
    expect(retry.statusCode).toBe(409)
    expect(retry.json().code).toBe('OPERATION_DELETED')
    const draft = await post(`/api/v1/estimates/${source.id}/revisions`, {
      expectedVersion: source.version,
    })
    const revision = await post(`/api/v1/estimates/${draft.json().id}/issue`, {
      expectedVersion: draft.json().version,
    })
    expect(revision.statusCode, revision.body).toBe(200)
    const numbered = revision.json<Estimate>()
    const impact = await preview(selection('estimates', [numbered]))
    expect(impact.blockers).toEqual(['NUMBERED_DOCUMENTS'])
    expect(
      (
        await post('/api/v1/sales/deletion', {
          ...selection('estimates', [numbered]),
          token: impact.token,
        })
      ).statusCode,
    ).toBe(409)
    expect(
      (await fixture.client`select status from estimates where id=${source.id}`)[0]!.status,
    ).toBe('superseded')
  })
})
