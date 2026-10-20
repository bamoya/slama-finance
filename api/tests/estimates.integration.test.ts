import { createHash, randomUUID } from 'node:crypto'

import { PDFDict, PDFDocument, PDFName } from 'pdf-lib'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/env.js'
import type { ObjectStorage } from '../src/integrations/contracts.js'
import { createPasswordService } from '../src/modules/identity/auth/services/password.service.js'
import { createMediaModule } from '../src/modules/media/index.js'
import { createEstimateRepository } from '../src/modules/sales/estimates/repositories/estimate.repository.js'
import { createSalesModule } from '../src/modules/sales/index.js'
import { renderSalesPdf } from '../src/modules/sales/shared/services/sales-pdf.service.js'
import { isolatedDatabase, testUserId } from './helpers/postgres.js'

const headers = { origin: 'http://localhost:5173' }
const clientId = '33333333-3333-4333-8333-333333333333'

describe('Estimates lifecycle', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let app: Awaited<ReturnType<typeof buildApp>>
  let cookies: { slama_session: string }
  let storage: ObjectStorage
  let objects: Map<string, Uint8Array>
  beforeEach(async () => {
    fixture = await isolatedDatabase()
    await fixture.client`update company_settings set legal_name='Slama Agricole', address_line1='Rue Atlas', city='Casablanca' where id=1`
    await fixture.client`insert into clients (id,type,legal_name,address_line1,city) values (${clientId},'company','Atlas SARL','Rue Hassan','Rabat')`
    const hash = await createPasswordService().hash('estimates-password-123')
    await fixture.client`update users set password_hash=${hash} where id=${testUserId}`
    await fixture.client`insert into user_roles (user_id,role_id) select ${testUserId},id from roles where key='admin'`
    objects = new Map<string, Uint8Array>()
    storage = {
      async putImmutable(input) {
        if (objects.has(input.key)) throw new Error('Immutable')
        objects.set(input.key, input.bytes)
        return {
          key: input.key,
          contentType: input.contentType,
          byteSize: input.bytes.length,
          sha256: createHash('sha256').update(input.bytes).digest('hex'),
        }
      },
      async get(key) {
        const bytes = objects.get(key)
        if (!bytes) throw new Error('Missing artifact')
        return bytes
      },
      async deleteUnreferenced(key) {
        objects.delete(key)
      },
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
    app.database = () => fixture.db
    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers,
      payload: { email: 'operator@example.test', password: 'estimates-password-123' },
    })
    cookies = { slama_session: login.cookies[0]!.value }
  })
  afterEach(async () => {
    await app?.close()
    await fixture?.cleanup()
  })
  const post = (url: string, payload: object) =>
    app.inject({ method: 'POST', url, headers, cookies, payload })

  const revisionInput = () => ({
    clientId,
    templateId: null,
    issueDate: '2026-10-02',
    validUntil: '2026-10-20',
    notes: 'Keep notes',
    paymentTerms: 'Cash',
    lines: [
      {
        productVariantId: null,
        productName: 'Wheat',
        quantity: 2,
        unitPrice: '50.00',
        vatRate: null,
      },
    ],
  })
  async function cancellableInvoice(templateId: string | null = null) {
    const { validUntil: _, ...input } = revisionInput()
    const created = await post('/v1/invoices', { ...input, templateId, dueDate: null })
    expect(created.statusCode, created.body).toBe(201)
    const issued = await post(`/v1/invoices/${created.json().id}/issue`, { expectedVersion: 1 })
    expect(issued.statusCode, issued.body).toBe(200)
    return issued.json()
  }
  async function cancellationPayment(invoiceId: string) {
    const result = await post('/v1/payments', {
      operationId: randomUUID(),
      invoiceId,
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
    expect(result.statusCode, result.body).toBe(201)
    return result.json()
  }
  it('previews and atomically cancels invoice chains, preserving already cancelled records', async () => {
    const invoice = await cancellableInvoice()
    await fixture.client`update clients set email='client@example.test' where id=${clientId}`
    await fixture.client`update notification_rules set sender_email='sender@example.test' where event_key='invoice_sent'`
    const email = await post(`/v1/invoices/${invoice.id}/send`, {
      requestId: randomUUID(),
      expectedVersion: invoice.version,
      overridePreferences: true,
    })
    expect(email.statusCode, email.body).toBe(202)
    const payment = await cancellationPayment(invoice.id)
    const preserved = await cancellationPayment(invoice.id)
    expect(
      (
        await post(`/v1/payments/${preserved.id}/cancel`, {
          expectedVersion: preserved.version,
          reason: 'Original reason',
        })
      ).statusCode,
    ).toBe(200)
    const [note] =
      await fixture.client`insert into delivery_notes(client_id,invoice_id,delivery_date,issuer_snapshot,client_snapshot,delivery_address) values(${clientId},${invoice.id},'2026-10-02','{}','{}','Rabat') returning id`
    await fixture.client`update payments set receipt_issued_at=now() where id=${payment.id}`
    const selection = { invoices: [{ id: invoice.id, expectedVersion: invoice.version }] }
    const preview = await post('/v1/invoices/cancellation/preview', selection)
    expect(preview.statusCode, preview.body).toBe(200)
    expect(preview.json()).toMatchObject({
      invoices: [{ id: invoice.id }],
      payments: [{ id: payment.id }],
      deliveryNotes: [{ id: note!.id, name: null }],
      receipts: 1,
      alreadyCancelled: 1,
    })
    expect(
      (await fixture.client`select status from invoices where id=${invoice.id}`)[0]!.status,
    ).toBe('issued')
    const input = { ...selection, token: preview.json().token, reason: 'Client cancelled order' }
    expect((await post('/v1/invoices/cancellation', input)).statusCode).toBe(204)
    expect(
      (await fixture.client`select status from background_jobs where id=${email.json().jobId}`)[0]!
        .status,
    ).toBe('cancelled')
    expect(
      (await fixture.client`select status,version from invoices where id=${invoice.id}`)[0],
    ).toMatchObject({ status: 'cancelled', version: invoice.version + 1 })
    expect(
      (await fixture.client`select status,version from payments where id=${payment.id}`)[0],
    ).toMatchObject({ status: 'cancelled', version: payment.version + 1 })
    expect(
      (await fixture.client`select status,number from delivery_notes where id=${note!.id}`)[0],
    ).toMatchObject({ status: 'cancelled', number: null })
    expect(
      (await fixture.client`select cancellation_reason from payments where id=${preserved.id}`)[0]!
        .cancellation_reason,
    ).toBe('Original reason')
    expect((await post('/v1/invoices/cancellation', input)).statusCode).toBe(409)
    expect(
      (
        await fixture.client`select count(*) from audit_events where action='cancel' and entity_key->>'id'=${invoice.id}`
      )[0]!.count,
    ).toBe('1')
  })
  it('rolls back children, roots and audit events if any cancellation in the batch fails', async () => {
    const first = await cancellableInvoice()
    const second = await cancellableInvoice()
    const payment = await cancellationPayment(first.id)
    await fixture.client`update invoices set notes='force rollback' where id=${second.id}`
    await fixture.client
      .unsafe(`create function reject_test_cancellation() returns trigger language plpgsql as $$
      begin
        if new.status='cancelled' and old.notes='force rollback' then raise exception 'test rollback'; end if;
        return new;
      end $$;
      create trigger reject_test_cancellation before update on invoices for each row execute function reject_test_cancellation();`)
    const selection = {
      invoices: [first, second].map((row) => ({ id: row.id, expectedVersion: row.version })),
    }
    const preview = await post('/v1/invoices/cancellation/preview', selection)
    expect(preview.statusCode, preview.body).toBe(200)
    const result = await post('/v1/invoices/cancellation', {
      ...selection,
      token: preview.json().token,
      reason: 'Cancel all',
    })
    expect(result.statusCode).toBe(500)
    expect(
      (
        await fixture.client`select status from invoices where id in (${first.id},${second.id})`
      ).every((row) => row.status === 'issued'),
    ).toBe(true)
    expect(
      (await fixture.client`select status,version from payments where id=${payment.id}`)[0],
    ).toMatchObject({ status: 'confirmed', version: payment.version })
    expect(
      (await fixture.client`select count(*) from audit_events where action='cancel'`)[0]!.count,
    ).toBe('0')
  })
  it('blocks a whole bulk cancellation for changed impact, missing permissions or invalid selections', async () => {
    const first = await cancellableInvoice()
    const second = await cancellableInvoice()
    const selection = {
      invoices: [first, second].map((row) => ({ id: row.id, expectedVersion: row.version })),
    }
    const preview = await post('/v1/invoices/cancellation/preview', selection)
    expect(preview.statusCode, preview.body).toBe(200)
    const payment = await cancellationPayment(second.id)
    const stale = await post('/v1/invoices/cancellation', {
      ...selection,
      token: preview.json().token,
      reason: 'Cancel both',
    })
    expect(stale.statusCode, stale.body).toBe(409)
    expect(stale.json().code).toBe('IMPACT_CHANGED')
    await fixture.client`delete from role_permissions where role_id in (select id from roles where key='admin') and permission_id in (select id from permissions where key='payments.update')`
    expect((await post('/v1/invoices/cancellation/preview', selection)).statusCode).toBe(403)
    expect(
      (
        await fixture.client`select status from invoices where id in (${first.id},${second.id})`
      ).every((row) => row.status === 'issued'),
    ).toBe(true)
    expect(
      (await fixture.client`select status from payments where id=${payment.id}`)[0]!.status,
    ).toBe('confirmed')
    const invalid = await post('/v1/invoices/cancellation/preview', {
      invoices: [
        { id: first.id, expectedVersion: first.version },
        { id: randomUUID(), expectedVersion: 1 },
      ],
    })
    expect(invalid.statusCode).toBe(404)
    expect(
      (
        await post('/v1/invoices/cancellation/preview', {
          invoices: [selection.invoices[0], selection.invoices[0]],
        })
      ).statusCode,
    ).toBe(400)
    await fixture.client`insert into role_permissions(role_id,permission_id) select r.id,p.id from roles r, permissions p where r.key='admin' and p.key='payments.update'`
    const fresh = await post('/v1/invoices/cancellation/preview', selection)
    expect(fresh.statusCode, fresh.body).toBe(200)
    const request = { ...selection, token: fresh.json().token, reason: 'Cancel both' }
    const outcomes = await Promise.all([
      post('/v1/invoices/cancellation', request),
      post('/v1/invoices/cancellation', request),
    ])
    expect(outcomes.map((row) => row.statusCode).sort()).toEqual([204, 409])
    expect(
      (
        await fixture.client`select status from invoices where id in (${first.id},${second.id})`
      ).every((row) => row.status === 'cancelled'),
    ).toBe(true)
  })
  async function brandedDeliveryTemplate() {
    const png = await sharp({
      create: { width: 100, height: 40, channels: 4, background: '#176c51' },
    })
      .png()
      .toBuffer()
    const assets = []
    for (const purpose of ['company_logo', 'company_signature']) {
      const id = randomUUID(),
        key = `media/${id}.png`
      objects.set(key, new Uint8Array(png))
      await fixture.client`insert into media_assets(id,object_key,original_filename,content_type,byte_size,sha256,purpose,status) values(${id},${key},'brand.png','image/png',${png.length},${createHash('sha256').update(png).digest('hex')},${purpose},'ready')`
      assets.push(id)
    }
    const [template] =
      await fixture.client`insert into document_templates(name,layout,density,accent_color,logo_asset_id,signature_asset_id,show_signature,footer_text) values('BL default','atelier','compact','#176c51',${assets[0]!},${assets[1]!},true,'Saved BL footer') returning id`
    await fixture.client`update company_settings set default_template_id=${template!.id} where id=1`
    return { id: template!.id as string, assets }
  }
  async function independentDelivery() {
    const created = await post('/v1/delivery-notes', {
      clientId,
      invoiceId: null,
      deliveryDate: '2026-10-01',
      deliveryAddress: 'Rue Hassan',
      instructions: null,
      includeReceptionSignature: true,
      lines: [
        { productVariantId: null, sourceInvoiceLineId: null, productName: 'Wheat', quantity: 2 },
      ],
    })
    expect(created.statusCode, created.body).toBe(201)
    return created.json()
  }
  it.each(['independent', 'invoice'] as const)(
    'uses the company template for %s BLs, freezes it on delivery and renders both brand images',
    async (kind) => {
      const template = await brandedDeliveryTemplate()
      const [other] =
        await fixture.client`insert into document_templates(name,layout) values('Other invoice choice','essential') returning id`
      let draft
      if (kind === 'invoice') {
        const invoice = await cancellableInvoice(other!.id)
        const created = await post(`/v1/invoices/${invoice.id}/delivery-note`, {})
        expect(created.statusCode, created.body).toBe(201)
        draft = created.json()
      } else draft = await independentDelivery()
      expect(draft.templateId).toBe(template.id)
      const [next] =
        await fixture.client`insert into document_templates(name,layout,density,accent_color,logo_asset_id,signature_asset_id,show_signature,footer_text) values('Current BL default','modern','standard','#176c51',${template.assets[0]!},${template.assets[1]!},true,'Frozen footer') returning id`
      await fixture.client`update company_settings set default_template_id=${next!.id} where id=1`
      const delivered = await post(`/v1/delivery-notes/${draft.id}/deliver`, {
        expectedVersion: draft.version,
      })
      expect(delivered.statusCode, delivered.body).toBe(200)
      expect(delivered.json().templateId).toBe(next!.id)
      const version = delivered.json().contentVersion
      const [frozen] =
        await fixture.client`select appearance_snapshot from delivery_notes where id=${draft.id}`
      expect(frozen!.appearance_snapshot).toMatchObject({
        layout: 'modern',
        density: 'standard',
        showSignature: true,
        logoAssetId: template.assets[0],
        signatureAssetId: template.assets[1],
        footerText: 'Frozen footer',
      })
      const regenerated = await post(`/v1/documents/delivery_note/${draft.id}/regenerate-pdf`, {
        design: 'saved',
      })
      expect(regenerated.statusCode, regenerated.body).toBe(200)
      const download = await app.inject({
        url: `/v1/artifacts/${regenerated.json().id}/download`,
        cookies,
      })
      expect(download.statusCode).toBe(200)
      const pdf = await PDFDocument.load(download.rawPayload)
      expect(
        pdf.getPage(0).node.Resources()?.lookup(PDFName.of('XObject'), PDFDict).keys(),
      ).toHaveLength(2)
      const media = createMediaModule(() => fixture.db, storage)
      await fixture.client`update document_templates set footer_text='Latest footer' where id=${next!.id}`
      await fixture.client`update company_settings set default_template_id=${other!.id} where id=1`
      expect(
        (await media.publicApi.documentImages('delivery_note', draft.id, version)).appearance,
      ).toEqual(frozen!.appearance_snapshot)
      expect(
        (await media.publicApi.documentImages('delivery_note', draft.id, version, 'latest'))
          .appearance,
      ).toMatchObject({ layout: 'modern', footerText: 'Latest footer' })
      const latest = await post(`/v1/documents/delivery_note/${draft.id}/regenerate-pdf`, {
        design: 'latest',
      })
      expect(latest.statusCode, latest.body).toBe(200)
      expect(
        (
          await fixture.client`select appearance_snapshot from delivery_notes where id=${draft.id}`
        )[0]!.appearance_snapshot,
      ).toEqual(frozen!.appearance_snapshot)
    },
  )
  it('detaches deleted templates from BLs but preserves frozen designs and needed media', async () => {
    const template = await brandedDeliveryTemplate(),
      draft = await independentDelivery()
    const delivered = await post(`/v1/delivery-notes/${draft.id}/deliver`, {
      expectedVersion: draft.version,
    })
    expect(delivered.statusCode, delivered.body).toBe(200)
    const version = delivered.json().contentVersion
    const media = createMediaModule(() => fixture.db, storage)
    const before = (await media.publicApi.documentImages('delivery_note', draft.id, version))
      .appearance
    const selection = { resource: 'templates', records: [{ id: template.id, expectedVersion: 1 }] }
    const preview = await post('/v1/settings/deletion/preview', selection)
    expect(preview.statusCode, preview.body).toBe(200)
    expect(preview.json().groups).toContainEqual(
      expect.objectContaining({ resource: 'delivery_notes', operation: 'detach' }),
    )
    const deleted = await post('/v1/settings/deletion', {
      ...selection,
      token: preview.json().token,
    })
    expect(deleted.statusCode, deleted.body).toBe(204)
    const [row] =
      await fixture.client`select template_id,appearance_snapshot,content_version from delivery_notes where id=${draft.id}`
    expect(row).toEqual({
      template_id: null,
      appearance_snapshot: before,
      content_version: version,
    })
    const retained = await media.publicApi.documentImages('delivery_note', draft.id, version)
    expect(retained.logo).toBeDefined()
    expect(retained.signature).toBeDefined()
    for (const id of template.assets)
      expect(
        (await fixture.client`select status from media_assets where id=${id}`)[0]!.status,
      ).toBe('ready')
    expect(
      (await post(`/v1/documents/delivery_note/${draft.id}/regenerate-pdf`, { design: 'saved' }))
        .statusCode,
    ).toBe(200)
  })
  it('keeps legacy BLs Classic until explicit latest-design regeneration uses the company default', async () => {
    await brandedDeliveryTemplate()
    const draft = await independentDelivery()
    const delivered = await post(`/v1/delivery-notes/${draft.id}/deliver`, {
      expectedVersion: draft.version,
    })
    expect(delivered.statusCode, delivered.body).toBe(200)
    const legacy = { layout: 'classic', density: 'standard', accentColor: '#ad7d1d' }
    await fixture.client`update delivery_notes set template_id=null,appearance_snapshot=${JSON.stringify(legacy)}::jsonb where id=${draft.id}`
    const media = createMediaModule(() => fixture.db, storage)
    const saved = await media.publicApi.documentImages(
      'delivery_note',
      draft.id,
      delivered.json().contentVersion,
    )
    expect(saved.appearance).toEqual(legacy)
    expect(saved.logo).toBeUndefined()
    expect(saved.signature).toBeUndefined()
    const latest = await post(`/v1/documents/delivery_note/${draft.id}/regenerate-pdf`, {
      design: 'latest',
    })
    expect(latest.statusCode, latest.body).toBe(200)
    const downloaded = await app.inject({
      url: `/v1/artifacts/${latest.json().id}/download`,
      cookies,
    })
    const pdf = await PDFDocument.load(downloaded.rawPayload)
    expect(
      pdf.getPage(0).node.Resources()?.lookup(PDFName.of('XObject'), PDFDict).keys(),
    ).toHaveLength(2)
    expect(
      (
        await fixture.client`select appearance_snapshot from delivery_notes where id=${draft.id}`
      )[0]!.appearance_snapshot,
    ).toEqual(legacy)
  })
  it('resolves company template/date defaults and preserves explicit choices and issued snapshots', async () => {
    const [template] =
      await fixture.client`insert into document_templates(name,layout,accent_color,footer_text) values('Company default','atelier','#176c51','Company footer') returning id`
    const [other] =
      await fixture.client`insert into document_templates(name,layout) values('Explicit','essential') returning id`
    await fixture.client`update company_settings set default_template_id=${template!.id}, estimate_valid_days=23, payment_due_days=7 where id=1`
    for (const type of ['estimate', 'invoice'] as const) {
      await fixture.client`update document_templates set footer_text='Company footer' where id=${template!.id}`
      const path = `/v1/${type}s`
      const dateField = type === 'estimate' ? 'validUntil' : 'dueDate'
      const fields =
        type === 'estimate'
          ? { ...revisionInput(), validUntil: null }
          : { ...revisionInput(), validUntil: undefined, dueDate: null }
      const created = await post(path, fields)
      expect(created.statusCode, created.body).toBe(201)
      const draft = created.json()
      expect(draft.templateId).toBe(template!.id)
      expect(draft[dateField]).toBe(type === 'estimate' ? '2026-10-25' : '2026-10-09')
      const [row] = await fixture.client.unsafe(
        `select appearance_snapshot from ${type}s where id=$1`,
        [draft.id],
      )
      expect(row!.appearance_snapshot).toMatchObject({
        layout: 'atelier',
        accentColor: '#176c51',
        footerText: 'Company footer',
      })
      const explicit = await post(path, {
        ...fields,
        templateId: other!.id,
        [dateField]: '2026-12-31',
      })
      expect(explicit.json()).toMatchObject({ templateId: other!.id, [dateField]: '2026-12-31' })
      // Older drafts with missing values resolve defaults on issue without a backfill.
      await fixture.client.unsafe(
        `update ${type}s set template_id=null,${type === 'estimate' ? 'valid_until' : 'due_date'}=null where id=$1`,
        [draft.id],
      )
      const issued = await post(`${path}/${draft.id}/issue`, { expectedVersion: draft.version })
      expect(issued.statusCode, issued.body).toBe(200)
      expect(issued.json()).toMatchObject({
        templateId: template!.id,
        [dateField]: draft[dateField],
      })
      await fixture.client`update document_templates set footer_text='Later change' where id=${template!.id}`
      const [frozen] = await fixture.client.unsafe(
        `select appearance_snapshot from ${type}s where id=$1`,
        [draft.id],
      )
      expect(frozen!.appearance_snapshot.footerText).toBe('Company footer')
    }
    const invalid = await post('/v1/estimates', { ...revisionInput(), validUntil: '2026-10-01' })
    expect(invalid.statusCode).toBe(400)
  })
  it('defaults bank details, freezes them on issue and copies the agreement into invoice drafts', async () => {
    const [bank] =
      await fixture.client`insert into bank_accounts(name,bank_name,account_holder,rib) values('Main','Credit Agricole','Slama','225091032701984651012213') returning id`
    const company = (await app.inject({ url: '/v1/company-settings', cookies })).json()
    const configured = await app.inject({
      method: 'PATCH',
      url: '/v1/company-settings',
      headers,
      cookies,
      payload: {
        ...Object.fromEntries(
          Object.entries(company).filter(
            ([key]) =>
              ![
                'id',
                'version',
                'createdAt',
                'updatedAt',
                'createdByUserId',
                'updatedByUserId',
              ].includes(key),
          ),
        ),
        defaultBankAccountId: bank!.id,
        expectedVersion: company.version,
      },
    })
    expect(configured.statusCode, configured.body).toBe(200)
    const draftResponse = await post('/v1/estimates', {
      ...revisionInput(),
      agreedPaymentMethod: 'bank_transfer',
    })
    expect(draftResponse.statusCode, draftResponse.body).toBe(201)
    const draft = draftResponse.json()
    expect(draft.bankAccountId).toBe(bank!.id)
    expect(draft.bankDetailsSnapshot.bankName).toBe('Credit Agricole')
    await fixture.client`update bank_accounts set bank_name='Updated before issue' where id=${bank!.id}`
    const issuedResponse = await post(`/v1/estimates/${draft.id}/issue`, {
      expectedVersion: draft.version,
    })
    expect(issuedResponse.statusCode, issuedResponse.body).toBe(200)
    const issued = issuedResponse.json()
    expect(issued.bankDetailsSnapshot.bankName).toBe('Updated before issue')
    await fixture.client`update bank_accounts set bank_name='Changed after issue' where id=${bank!.id}`
    expect(
      (await app.inject({ url: `/v1/estimates/${draft.id}`, cookies })).json().bankDetailsSnapshot,
    ).toEqual(issued.bankDetailsSnapshot)
    expect(
      (await post(`/v1/estimates/${draft.id}/accept`, { expectedVersion: issued.version }))
        .statusCode,
    ).toBe(200)
    const conversion = await post(`/v1/estimates/${draft.id}/invoices`, {
      operationId: randomUUID(),
      dueDate: null,
    })
    expect(conversion.statusCode, conversion.body).toBe(201)
    expect(conversion.json()).toMatchObject({
      bankAccountId: bank!.id,
      agreedPaymentMethod: 'bank_transfer',
      bankDetailsSnapshot: issued.bankDetailsSnapshot,
    })
    const invoice = conversion.json()
    const finalized = await post(`/v1/invoices/${invoice.id}/issue`, {
      expectedVersion: invoice.version,
    })
    expect(finalized.statusCode, finalized.body).toBe(200)
    expect(finalized.json().bankDetailsSnapshot.bankName).toBe('Changed after issue')
    await fixture.client`update bank_accounts set bank_name='Later change' where id=${bank!.id}`
    expect(
      (await app.inject({ url: `/v1/invoices/${invoice.id}`, cookies })).json().bankDetailsSnapshot
        .bankName,
    ).toBe('Changed after issue')
    expect((await fixture.client`select count(*) from payments`)[0]!.count).toBe('0')
  })
  it('supports an explicit alternative bank, hiding details and rejects archived banks', async () => {
    const [bank] =
      await fixture.client`insert into bank_accounts(name,bank_name,account_holder,rib) values('Other','Other Bank','Slama','225091032701984651012213') returning id`
    await fixture.client`update company_settings set default_bank_account_id=${bank!.id} where id=1`
    for (const path of ['/v1/estimates', '/v1/invoices']) {
      const fields = path.endsWith('invoices')
        ? { ...revisionInput(), validUntil: undefined, dueDate: null }
        : revisionInput()
      const hidden = await post(path, { ...fields, bankAccountId: null, agreedPaymentMethod: null })
      expect(hidden.statusCode, hidden.body).toBe(201)
      expect(hidden.json()).toMatchObject({
        bankAccountId: null,
        bankDetailsSnapshot: null,
        agreedPaymentMethod: null,
      })
      expect((await post(path, { ...fields, bankAccountId: randomUUID() })).statusCode).toBe(400)
      expect(
        (
          await post(path, { ...fields, bankAccountId: bank!.id, agreedPaymentMethod: 'cheque' })
        ).json().bankAccountId,
      ).toBe(bank!.id)
    }
    expect(
      (await post(`/v1/bank-accounts/${bank!.id}/archive`, { expectedVersion: 1 })).statusCode,
    ).toBe(409)
    await fixture.client`update company_settings set default_bank_account_id=null where id=1`
    expect(
      (await post(`/v1/bank-accounts/${bank!.id}/archive`, { expectedVersion: 1 })).statusCode,
    ).toBe(200)
    expect(
      (await post('/v1/estimates', { ...revisionInput(), bankAccountId: bank!.id })).statusCode,
    ).toBe(400)
  })
  it('resolves draft company defaults at issue time and freezes the chosen document language', async () => {
    const draft = (await post('/v1/estimates', revisionInput())).json()
    expect(draft.locale).toBe('fr-MA')
    expect(draft.localeOverride).toBeNull()
    await fixture.client`update company_settings set locale='en-GB' where id=1`
    const refreshed = await app.inject({ method: 'GET', url: `/v1/estimates/${draft.id}`, cookies })
    expect(refreshed.json().locale).toBe('en-GB')
    const issued = await post(`/v1/estimates/${draft.id}/issue`, { expectedVersion: draft.version })
    expect(issued.statusCode, issued.body).toBe(200)
    expect(issued.json().locale).toBe('en-GB')
    await fixture.client`update company_settings set locale='fr-MA' where id=1`
    expect(
      (await app.inject({ method: 'GET', url: `/v1/estimates/${draft.id}`, cookies })).json()
        .locale,
    ).toBe('en-GB')
    const explicit = await post('/v1/estimates', { ...revisionInput(), localeOverride: 'en-GB' })
    expect(explicit.json()).toMatchObject({ locale: 'en-GB', localeOverride: 'en-GB' })
  })
  async function acceptedEstimate() {
    const created = await post('/v1/estimates', revisionInput())
    expect(created.statusCode, created.body).toBe(201)
    const id = created.json().id
    expect((await post(`/v1/estimates/${id}/issue`, { expectedVersion: 1 })).statusCode).toBe(200)
    const accepted = await post(`/v1/estimates/${id}/accept`, { expectedVersion: 2 })
    expect(accepted.statusCode).toBe(200)
    return accepted.json()
  }

  it('serializes revisions, supersedes only on issue and preserves invoices and payments', async () => {
    const original = await acceptedEstimate()
    const attempts = await Promise.all(
      [1, 2].map(() =>
        post(`/v1/estimates/${original.id}/revisions`, { expectedVersion: original.version }),
      ),
    )
    expect(attempts.map((response) => response.statusCode)).toEqual([200, 200])
    const revision = attempts[0]!.json()
    expect(attempts[1]!.json().id).toBe(revision.id)
    expect(revision).toMatchObject({
      status: 'draft',
      number: null,
      revisionOfId: original.id,
      total: original.total,
      notes: original.notes,
    })
    expect(revision.lines[0]).toMatchObject({
      productName: 'Wheat',
      quantity: 2,
      unitPrice: '50.00',
    })
    expect(revision.lines[0].id).not.toBe(original.lines[0].id)
    const invoice = await post(`/v1/estimates/${original.id}/invoices`, {
      operationId: randomUUID(),
      dueDate: '2026-12-31',
    })
    expect(invoice.statusCode, invoice.body).toBe(201)
    expect(
      (await post(`/v1/invoices/${invoice.json().id}/issue`, { expectedVersion: 1 })).statusCode,
    ).toBe(200)
    const payment = await post('/v1/payments', {
      operationId: randomUUID(),
      invoiceId: invoice.json().id,
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
    const invoicesBefore = await fixture.client`select * from invoices`
    const paymentsBefore = await fixture.client`select * from payments`
    const saved = await app.inject({
      method: 'PATCH',
      url: `/v1/estimates/${revision.id}`,
      headers,
      cookies,
      payload: {
        ...revisionInput(),
        expectedVersion: 1,
        lines: [{ ...revisionInput().lines[0], quantity: 3, unitPrice: '60.00' }],
      },
    })
    expect(saved.statusCode, saved.body).toBe(200)
    expect(saved.json().total).toBe('180.00')
    const issued = await post(`/v1/estimates/${revision.id}/issue`, {
      expectedVersion: saved.json().version,
    })
    expect(issued.statusCode, issued.body).toBe(200)
    const old = (await app.inject({ url: `/v1/estimates/${original.id}`, cookies })).json()
    expect(old).toMatchObject({
      status: 'superseded',
      revisionId: revision.id,
      total: original.total,
      contentVersion: original.contentVersion,
    })
    expect(await fixture.client`select * from invoices`).toEqual(invoicesBefore)
    expect(await fixture.client`select * from payments`).toEqual(paymentsBefore)
    expect(
      (
        await post(`/v1/estimates/${original.id}/invoices`, {
          operationId: randomUUID(),
          dueDate: '2026-12-31',
        })
      ).statusCode,
    ).toBe(409)
    expect(
      (await post(`/v1/estimates/${original.id}/revisions`, { expectedVersion: old.version }))
        .statusCode,
    ).toBe(409)
    const accepted = await post(`/v1/estimates/${revision.id}/accept`, {
      expectedVersion: issued.json().version,
    })
    expect(accepted.statusCode).toBe(200)
    for (const _ of [1, 2])
      expect(
        (
          await post(`/v1/estimates/${revision.id}/invoices`, {
            operationId: randomUUID(),
            dueDate: '2026-12-31',
          })
        ).statusCode,
      ).toBe(201)
    const next = await post(`/v1/estimates/${revision.id}/revisions`, {
      expectedVersion: accepted.json().version,
    })
    expect(next.statusCode).toBe(200)
    expect(next.json().revisionOfId).toBe(revision.id)
    const history = await app.inject({ url: '/v1/estimates?status=superseded', cookies })
    expect(history.json().items.map((row: { id: string }) => row.id)).toContain(original.id)
    const audit =
      await fixture.client`select action from audit_events where entity_table='estimates'`
    expect(audit.map((event) => event.action)).toContain('supersede')
  })

  it('deletes an unfinished revision without invalidating its original; cancelled originals cannot be superseded', async () => {
    const original = await acceptedEstimate()
    const draft = (
      await post(`/v1/estimates/${original.id}/revisions`, { expectedVersion: original.version })
    ).json()
    const deleted = await app.inject({
      method: 'DELETE',
      url: `/v1/estimates/${draft.id}`,
      headers,
      cookies,
      payload: { expectedVersion: 1 },
    })
    expect(deleted.statusCode).toBe(204)
    const old = (await app.inject({ url: `/v1/estimates/${original.id}`, cookies })).json()
    expect(old).toMatchObject({ status: 'accepted', revisionId: null })
    const fresh = (
      await post(`/v1/estimates/${original.id}/revisions`, { expectedVersion: old.version })
    ).json()
    expect(fresh.id).not.toBe(draft.id)
    expect(
      (
        await post(`/v1/estimates/${original.id}/cancel`, {
          expectedVersion: old.version,
          reason: 'Order cancelled',
        })
      ).statusCode,
    ).toBe(200)
    expect((await post(`/v1/estimates/${fresh.id}/issue`, { expectedVersion: 1 })).statusCode).toBe(
      409,
    )
    expect((await app.inject({ url: `/v1/estimates/${fresh.id}`, cookies })).json().status).toBe(
      'draft',
    )
  })

  it('rejects stale revisions, drafts, and missing create permission', async () => {
    const original = await acceptedEstimate()
    expect(
      (await post(`/v1/estimates/${original.id}/revisions`, { expectedVersion: 1 })).statusCode,
    ).toBe(409)
    const draft = (await post('/v1/estimates', revisionInput())).json()
    expect(
      (await post(`/v1/estimates/${draft.id}/revisions`, { expectedVersion: 1 })).statusCode,
    ).toBe(409)
    await fixture.client`delete from role_permissions where permission_id in (select id from permissions where key='estimates.create')`
    expect(
      (await post(`/v1/estimates/${original.id}/revisions`, { expectedVersion: original.version }))
        .statusCode,
    ).toBe(403)
  })

  it('creates a VAT-free draft, issues it once, prepares and downloads one PDF', async () => {
    const input = {
      clientId,
      templateId: null,
      issueDate: '2026-09-27',
      validUntil: '2026-10-12',
      notes: null,
      paymentTerms: null,
      lines: [
        {
          productVariantId: null,
          productName: 'قمح Wheat 500 g',
          quantity: 4,
          unitPrice: '25.00',
          vatRate: null,
        },
      ],
    }
    const created = await post('/v1/estimates', input)
    expect(created.statusCode, JSON.stringify(created.json())).toBe(201)
    expect(created.json()).toMatchObject({
      status: 'draft',
      subtotal: '100.00',
      taxTotal: '0.00',
      total: '100.00',
      lines: [{ productName: 'قمح Wheat 500 g', vatRate: null }],
    })
    const id = created.json().id
    expect(
      (await post(`/v1/documents/estimate/${id}/regenerate-pdf`, { design: 'saved' })).statusCode,
    ).toBe(409)
    const issue = await post(`/v1/estimates/${id}/issue`, { expectedVersion: 1 })
    expect(issue.statusCode).toBe(200)
    expect(issue.json()).toMatchObject({ status: 'issued', version: 2, contentVersion: 2 })
    expect(issue.json().number).toMatch(/^DEV-\d{4}-\d{10}$/)
    expect((await post(`/v1/estimates/${id}/issue`, { expectedVersion: 1 })).statusCode).toBe(409)
    expect((await app.inject({ url: `/v1/estimates/${id}`, cookies })).json().number).toBe(
      issue.json().number,
    )
    await fixture.client`update background_jobs set status='failed', attempts=max_attempts, finished_at=now() where payload->>'documentId'=${id}`
    const retried = await post(`/v1/estimates/${id}/pdf`, {})
    expect(retried.statusCode).toBe(202)
    expect(
      (
        await fixture.client`select status,attempts from background_jobs where payload->>'documentId'=${id}`
      )[0],
    ).toMatchObject({ status: 'queued', attempts: 0 })
    const repo = createEstimateRepository(() => fixture.db)
    await renderSalesPdf(await repo.one(id), await repo.lines(id), 'ESTIMATE')
    const worker = createSalesModule(
      () => fixture.db,
      storage,
      createMediaModule(() => fixture.db, storage).publicApi,
    ).worker
    expect(await worker.runOne()).toBe(true)
    const artifacts = await app.inject({ url: `/v1/estimates/${id}/artifacts`, cookies })
    expect(artifacts.statusCode).toBe(200)
    const jobState = await fixture.client`select status,last_error_code from background_jobs`
    expect(artifacts.json(), JSON.stringify(jobState)).toHaveLength(1)
    const download = await app.inject({
      url: `/v1/artifacts/${artifacts.json()[0].id}/download`,
      cookies,
    })
    expect(download.statusCode).toBe(200)
    expect(download.headers['content-type']).toContain('application/pdf')
    expect(download.rawPayload.subarray(0, 5).toString()).toBe('%PDF-')
    const before = (await app.inject({ url: `/v1/estimates/${id}`, cookies })).json()
    const [previous] =
      await fixture.client`select * from document_artifacts where document_id=${id}`
    const regenerated = await post(`/v1/documents/estimate/${id}/regenerate-pdf`, {
      design: 'saved',
    })
    expect(regenerated.statusCode, regenerated.body).toBe(200)
    const [replacement] =
      await fixture.client`select * from document_artifacts where document_id=${id}`
    expect(replacement!.id).toBe(previous!.id)
    expect(replacement!.object_key).not.toBe(previous!.object_key)
    expect(
      (await post(`/v1/documents/estimate/${id}/regenerate-pdf`, { design: 'invalid' })).statusCode,
    ).toBe(400)
    expect(
      (await post(`/v1/documents/estimate/${id}/regenerate-pdf`, { design: 'latest' })).statusCode,
    ).toBe(409)
    expect((await app.inject({ url: `/v1/estimates/${id}`, cookies })).json()).toEqual(before)
    expect(
      await fixture.client`select id from audit_events where action='regenerate_pdf'`,
    ).toHaveLength(1)
    const put = storage.putImmutable
    storage.putImmutable = async () => {
      throw new Error('Storage offline')
    }
    expect(
      (await post(`/v1/documents/estimate/${id}/regenerate-pdf`, { design: 'saved' })).statusCode,
    ).toBe(503)
    storage.putImmutable = put
    expect(
      (await fixture.client`select object_key from document_artifacts where document_id=${id}`)[0]!
        .object_key,
    ).toBe(replacement!.object_key)
    expect(
      (await app.inject({ url: `/v1/artifacts/${replacement!.id}/download`, cookies })).statusCode,
    ).toBe(200)
    const locked = await app.inject({
      method: 'PATCH',
      url: `/v1/estimates/${id}`,
      headers,
      cookies,
      payload: { ...input, expectedVersion: before.version },
    })
    expect(locked.statusCode).toBe(409)
    const templateId = randomUUID()
    await fixture.client`insert into document_templates (id,name,layout,footer_text) values (${templateId},'Updated design','modern','New template footer')`
    await fixture.client`update company_settings set default_template_id=${templateId}, legal_name='Changed company' where id=1`
    const latest = await createMediaModule(() => fixture.db, storage).publicApi.documentImages(
      'estimate',
      id,
      before.contentVersion,
      'latest',
    )
    expect(latest.appearance).toMatchObject({ layout: 'modern', footerText: 'New template footer' })
    expect(
      (await post(`/v1/documents/estimate/${id}/regenerate-pdf`, { design: 'latest' })).statusCode,
    ).toBe(200)
    expect((await app.inject({ url: `/v1/estimates/${id}`, cookies })).json()).toEqual(before)
    let arrivals = 0
    let release!: () => void
    const barrier = new Promise<void>((resolve) => {
      release = resolve
    })
    storage.putImmutable = async (input) => {
      const result = await put(input)
      if (++arrivals === 2) release()
      await barrier
      return result
    }
    const concurrent = await Promise.all([
      post(`/v1/documents/estimate/${id}/regenerate-pdf`, { design: 'saved' }),
      post(`/v1/documents/estimate/${id}/regenerate-pdf`, { design: 'saved' }),
    ])
    storage.putImmutable = put
    expect(concurrent.map((result) => result.statusCode).sort()).toEqual([200, 409])
    await fixture.client`delete from role_permissions where permission_id in (select id from permissions where key='estimates.update')`
    expect(
      (await post(`/v1/documents/estimate/${id}/regenerate-pdf`, { design: 'saved' })).statusCode,
    ).toBe(403)
  })

  it('converts one accepted estimate into multiple deliberate invoices without duplicate retries', async () => {
    const draft = await post('/v1/estimates', {
      clientId,
      templateId: null,
      issueDate: '2026-09-27',
      validUntil: '2026-10-12',
      notes: null,
      paymentTerms: null,
      lines: [
        {
          productVariantId: null,
          productName: 'Wheat 500 g',
          quantity: 2,
          unitPrice: '25.00',
          vatRate: '20',
        },
      ],
    })
    expect(draft.statusCode).toBe(201)
    const estimateId = draft.json().id
    expect(
      (await post(`/v1/estimates/${estimateId}/issue`, { expectedVersion: 1 })).statusCode,
    ).toBe(200)
    expect(
      (await post(`/v1/estimates/${estimateId}/accept`, { expectedVersion: 2 })).statusCode,
    ).toBe(200)
    const operationId = randomUUID()
    const first = await post(`/v1/estimates/${estimateId}/invoices`, {
      operationId,
      dueDate: '2026-10-20',
    })
    expect(first.statusCode, JSON.stringify(first.json())).toBe(201)
    expect(first.json()).toMatchObject({
      status: 'draft',
      sourceEstimateId: estimateId,
      subtotal: '50.00',
      taxTotal: '10.00',
      total: '60.00',
    })
    const retry = await post(`/v1/estimates/${estimateId}/invoices`, {
      operationId,
      dueDate: '2026-10-20',
    })
    expect(retry.statusCode).toBe(201)
    expect(retry.json().id).toBe(first.json().id)
    expect(
      (await post(`/v1/estimates/${estimateId}/invoices`, { operationId, dueDate: '2026-10-21' }))
        .statusCode,
    ).toBe(409)
    const second = await post(`/v1/estimates/${estimateId}/invoices`, {
      operationId: randomUUID(),
      dueDate: '2026-10-20',
    })
    expect(second.statusCode).toBe(201)
    expect(second.json().id).not.toBe(first.json().id)
    const linked = await app.inject({ url: `/v1/estimates/${estimateId}/invoices`, cookies })
    expect(linked.json()).toHaveLength(2)
    const issue = await post(`/v1/invoices/${first.json().id}/issue`, { expectedVersion: 1 })
    expect(issue.statusCode, JSON.stringify(issue.json())).toBe(200)
    expect(issue.json().number).toMatch(/^FAC-\d{4}-\d{10}$/)
    const beforeInvoice = (
      await app.inject({ url: `/v1/invoices/${first.json().id}`, cookies })
    ).json()
    const invoicePdf = await post(`/v1/documents/invoice/${first.json().id}/regenerate-pdf`, {
      design: 'saved',
    })
    expect(invoicePdf.statusCode, invoicePdf.body).toBe(200)
    expect((await app.inject({ url: `/v1/invoices/${first.json().id}`, cookies })).json()).toEqual(
      beforeInvoice,
    )
    const worker = createSalesModule(
      () => fixture.db,
      storage,
      createMediaModule(() => fixture.db, storage).publicApi,
    ).worker
    expect(await worker.runOne()).toBe(true)
    expect(await worker.runOne()).toBe(true)
    const artifacts = await app.inject({
      url: `/v1/invoices/${first.json().id}/artifacts`,
      cookies,
    })
    expect(artifacts.json()).toHaveLength(1)
    const download = await app.inject({
      url: `/v1/artifacts/${artifacts.json()[0].id}/download`,
      cookies,
    })
    expect(download.rawPayload.subarray(0, 5).toString()).toBe('%PDF-')
  })
  it('consolidates BLs into one invoice and rejects cross-invoice allocation through API and SQL', async () => {
    const notes = []
    for (let index = 0; index < 2; index++) {
      const created = await post('/v1/delivery-notes', {
        clientId,
        invoiceId: null,
        deliveryDate: '2026-10-01',
        deliveryAddress: 'Rue Hassan',
        instructions: null,
        includeReceptionSignature: false,
        lines: [
          {
            productVariantId: null,
            sourceInvoiceLineId: null,
            productName: `Wheat ${index}`,
            quantity: 3,
          },
        ],
      })
      expect(created.statusCode, created.body).toBe(201)
      const delivered = await post(`/v1/delivery-notes/${created.json().id}/deliver`, {
        expectedVersion: 1,
      })
      expect(delivered.statusCode, delivered.body).toBe(200)
      notes.push(delivered.json())
    }
    const input = {
      operationId: randomUUID(),
      templateId: null,
      issueDate: '2026-10-01',
      dueDate: '2026-10-16',
      notes: null,
      paymentTerms: null,
      lines: notes.map((note) => ({
        deliveryNoteLineId: note.lines[0].id,
        quantity: 3,
        unitPrice: '10.00',
        vatRate: null,
      })),
    }
    const combined = await post('/v1/invoices/from-deliveries', input)
    expect(combined.statusCode, combined.body).toBe(201)
    expect(combined.json().deliveryNoteIds.sort()).toEqual(notes.map((note) => note.id).sort())
    expect((await post('/v1/invoices/from-deliveries', input)).json().id).toBe(combined.json().id)
    for (const note of notes) {
      const current = (await app.inject({ url: `/v1/delivery-notes/${note.id}`, cookies })).json()
      expect(current.invoiceId).toBe(combined.json().id)
      expect(current.version).toBe(note.version + 1)
    }
    const competing = await post('/v1/invoices', {
      ...revisionInput(),
      validUntil: undefined,
      dueDate: null,
    })
    expect(competing.statusCode, competing.body).toBe(201)
    const other = competing.json()
    await expect(
      fixture.client`insert into delivery_invoice_allocations(invoice_line_id,delivery_note_line_id,quantity) values(${other.lines[0].id},${notes[0].lines[0].id},1)`,
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      fixture.client`update delivery_notes set invoice_id=${other.id} where id=${notes[0].id}`,
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      fixture.client`update invoice_lines set invoice_id=${other.id},position=99 where id=${combined.json().lines[0].id}`,
    ).rejects.toMatchObject({ code: '23514' })
    const attempts = await Promise.all([
      post('/v1/invoices/from-deliveries', { ...input, operationId: randomUUID() }),
      post('/v1/invoices/from-deliveries', { ...input, operationId: randomUUID() }),
    ])
    expect(attempts.map((result) => result.statusCode)).toEqual([409, 409])
    expect(
      (await fixture.client`select count(*) from delivery_invoice_allocations`)[0]!.count,
    ).toBe('2')
    const fresh = await post('/v1/delivery-notes', {
      clientId,
      invoiceId: null,
      deliveryDate: '2026-10-01',
      deliveryAddress: 'Rue Hassan',
      instructions: null,
      includeReceptionSignature: false,
      lines: [
        { productVariantId: null, sourceInvoiceLineId: null, productName: 'Race', quantity: 1 },
      ],
    })
    expect(fresh.statusCode, fresh.body).toBe(201)
    const ready = await post(`/v1/delivery-notes/${fresh.json().id}/deliver`, {
      expectedVersion: 1,
    })
    expect(ready.statusCode, ready.body).toBe(200)
    const claim = () =>
      post('/v1/invoices/from-deliveries', {
        ...input,
        operationId: randomUUID(),
        lines: [
          {
            deliveryNoteLineId: ready.json().lines[0].id,
            quantity: 1,
            unitPrice: '10.00',
            vatRate: null,
          },
        ],
      })
    const race = await Promise.all([claim(), claim()])
    expect(race.map((result) => result.statusCode).sort()).toEqual([201, 409])
    const winning = race.find((result) => result.statusCode === 201)!.json()
    expect(
      (await app.inject({ url: `/v1/delivery-notes/${fresh.json().id}`, cookies })).json()
        .invoiceId,
    ).toBe(winning.id)
  })
  it('prepares an independent delivery note and prevents over-delivery against an invoice', async () => {
    const independent = await post('/v1/delivery-notes', {
      clientId,
      invoiceId: null,
      deliveryDate: '2026-09-27',
      deliveryAddress: 'Rue Hassan, Rabat',
      instructions: null,
      includeReceptionSignature: true,
      lines: [
        {
          productVariantId: null,
          sourceInvoiceLineId: null,
          productName: 'قمح Wheat 500 g',
          quantity: 3,
        },
      ],
    })
    expect(independent.statusCode, JSON.stringify(independent.json())).toBe(201)
    const prepared = await post(`/v1/delivery-notes/${independent.json().id}/deliver`, {
      expectedVersion: 1,
    })
    expect(prepared.statusCode, JSON.stringify(prepared.json())).toBe(200)
    expect(prepared.json().number).toMatch(/^BL-\d{4}-\d{10}$/)
    const worker = createSalesModule(
      () => fixture.db,
      storage,
      createMediaModule(() => fixture.db, storage).publicApi,
    ).worker
    expect(await worker.runOne()).toBe(true)
    const artifacts = await app.inject({
      url: `/v1/delivery-notes/${independent.json().id}/artifacts`,
      cookies,
    })
    expect(artifacts.json()).toHaveLength(1)
    const download = await app.inject({
      url: `/v1/artifacts/${artifacts.json()[0].id}/download`,
      cookies,
    })
    expect(download.rawPayload.subarray(0, 5).toString()).toBe('%PDF-')
    expect(prepared.json().status).toBe('delivered')
    const deliveryPdf = await post(
      `/v1/documents/delivery_note/${independent.json().id}/regenerate-pdf`,
      { design: 'saved' },
    )
    expect(deliveryPdf.statusCode, deliveryPdf.body).toBe(200)
    expect(
      (await app.inject({ url: `/v1/delivery-notes/${independent.json().id}`, cookies })).json(),
    ).toEqual(prepared.json())
    const deliveryLineId = prepared.json().lines[0].id
    const conversion = (quantity: number, operationId = randomUUID()) => ({
      operationId,
      templateId: null,
      issueDate: '2026-09-27',
      dueDate: '2026-10-27',
      notes: null,
      paymentTerms: null,
      lines: [{ deliveryNoteLineId: deliveryLineId, quantity, unitPrice: '25.00', vatRate: null }],
    })
    const request = conversion(2)
    const deliveryInvoice = await post('/v1/invoices/from-deliveries', request)
    expect(deliveryInvoice.statusCode, JSON.stringify(deliveryInvoice.json())).toBe(201)
    expect(deliveryInvoice.json()).toMatchObject({
      status: 'draft',
      subtotal: '50.00',
      taxTotal: '0.00',
    })
    expect(deliveryInvoice.json().deliveryNoteIds).toContain(independent.json().id)
    const retry = await post('/v1/invoices/from-deliveries', request)
    expect(retry.json().id).toBe(deliveryInvoice.json().id)
    expect((await post('/v1/invoices/from-deliveries', conversion(2))).statusCode).toBe(409)
    expect(
      (
        await post(`/v1/delivery-notes/${independent.json().id}/cancel`, {
          expectedVersion: prepared.json().version,
          reason: 'Test',
        })
      ).statusCode,
    ).toBe(409)
    const secondDeliveryInvoice = await post('/v1/invoices/from-deliveries', conversion(1))
    expect(secondDeliveryInvoice.statusCode).toBe(409)
    const independentDetail = await app.inject({
      url: `/v1/delivery-notes/${independent.json().id}`,
      cookies,
    })
    expect(independentDetail.statusCode, JSON.stringify(independentDetail.json())).toBe(200)
    expect(independentDetail.json().invoiceId).toBe(deliveryInvoice.json().id)
    expect(independentDetail.json().invoices).toEqual([
      { id: deliveryInvoice.json().id, number: null, status: 'draft' },
    ])

    const draft = await post('/v1/invoices', {
      clientId,
      templateId: null,
      issueDate: '2026-09-27',
      dueDate: '2026-10-27',
      notes: null,
      paymentTerms: null,
      lines: [
        {
          productVariantId: null,
          productName: 'Wheat 500 g',
          quantity: 5,
          unitPrice: '25.00',
          vatRate: null,
        },
      ],
    })
    expect(draft.statusCode, JSON.stringify(draft.json())).toBe(201)
    const invoice = await post(`/v1/invoices/${draft.json().id}/issue`, { expectedVersion: 1 })
    expect(invoice.statusCode, JSON.stringify(invoice.json())).toBe(200)
    const input = (quantity: number) => ({
      clientId,
      invoiceId: invoice.json().id,
      deliveryDate: '2026-09-27',
      deliveryAddress: 'Rue Hassan, Rabat',
      instructions: null,
      includeReceptionSignature: true,
      lines: [
        {
          productVariantId: null,
          sourceInvoiceLineId: invoice.json().lines[0].id,
          productName: 'Wheat 500 g',
          quantity,
        },
      ],
    })
    const first = await post('/v1/delivery-notes', input(3))
    expect(first.statusCode, JSON.stringify(first.json())).toBe(201)
    expect(first.json().invoices).toEqual([
      { id: invoice.json().id, number: invoice.json().number, status: 'issued' },
    ])
    expect(
      (await app.inject({ url: `/v1/invoices/${invoice.json().id}`, cookies })).json()
        .deliveryNoteIds,
    ).toContain(first.json().id)
    expect((await post('/v1/delivery-notes', input(3))).statusCode).toBe(409)
    const second = await post('/v1/delivery-notes', input(2))
    expect(second.statusCode).toBe(201)
    expect(
      (
        await post(`/v1/invoices/${invoice.json().id}/cancel`, {
          expectedVersion: 2,
          reason: 'Test',
        })
      ).statusCode,
    ).toBe(409)
    const convertedIssued = await post(`/v1/invoices/${deliveryInvoice.json().id}/issue`, {
      expectedVersion: deliveryInvoice.json().version,
    })
    expect(convertedIssued.statusCode, convertedIssued.body).toBe(200)
    for (const root of [convertedIssued.json(), invoice.json()]) {
      const selection = { invoices: [{ id: root.id, expectedVersion: root.version }] }
      const impact = await post('/v1/invoices/cancellation/preview', selection)
      expect(impact.statusCode, impact.body).toBe(200)
      expect(impact.json().deliveryNotes.length).toBe(root.id === invoice.json().id ? 2 : 1)
      const result = await post('/v1/invoices/cancellation', {
        ...selection,
        token: impact.json().token,
        reason: 'Order cancelled with its deliveries',
      })
      expect(result.statusCode, result.body).toBe(204)
      const notes =
        await fixture.client`select status from delivery_notes where invoice_id=${root.id}`
      expect(notes.every((note) => note.status === 'cancelled')).toBe(true)
    }
  })
})
