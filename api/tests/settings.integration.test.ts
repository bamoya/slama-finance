import { createHash } from 'node:crypto'

import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/env.js'
import { createPasswordService } from '../src/modules/identity/auth/services/password.service.js'
import { isolatedDatabase, testUserId } from './helpers/postgres.js'

const headers = { origin: 'http://localhost:5173' }
const bank = {
  name: 'Main account',
  bankName: 'Sample bank',
  accountHolder: 'Company',
  currency: 'MAD',
  rib: '001234567890123456789012',
  iban: null,
}
const template = {
  name: 'Classic',
  layout: 'classic',
  accentColor: '#ad7d1d',
  logoAssetId: null,
  signatureAssetId: null,
  showBankDetails: true,
  showSignature: false,
  showPaymentTerms: true,
  footerText: null,
  paymentTerms: null,
}
function editable(row: Record<string, unknown>) {
  const {
    id: _id,
    version,
    createdAt: _ca,
    updatedAt: _ua,
    createdByUserId: _cb,
    updatedByUserId: _ub,
    archivedAt: _archive,
    ...fields
  } = row
  return { ...fields, expectedVersion: version }
}
describe('Company settings module', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let app: Awaited<ReturnType<typeof buildApp>>
  let cookies: { slama_session: string }
  let objects: Map<string, Uint8Array>
  beforeEach(async () => {
    fixture = await isolatedDatabase()
    const hash = await createPasswordService().hash('settings-password-123')
    await fixture.client`update users set password_hash=${hash} where id=${testUserId}`
    await fixture.client`insert into user_roles (user_id,role_id) select ${testUserId},id from roles where key='admin'`
    objects = new Map()
    app = await buildApp({
      environment: loadEnvironment({ NODE_ENV: 'test' }),
      logger: false,
      mediaStorage: {
        async deleteUnreferenced(key) {
          objects.delete(key)
        },
        async signedDownloadUrl() {
          throw new Error('Not used by authenticated media downloads')
        },
        async putImmutable(input) {
          if (objects.has(input.key)) throw new Error('Immutable')
          objects.set(input.key, input.bytes)
          return {
            key: input.key,
            byteSize: input.bytes.length,
            contentType: input.contentType,
            sha256: createHash('sha256').update(input.bytes).digest('hex'),
          }
        },
        async get(key) {
          const bytes = objects.get(key)
          if (!bytes) throw new Error('Missing asset')
          return bytes
        },
      },
    })
    app.database = () => fixture.db
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers,
      payload: { email: 'operator@example.test', password: 'settings-password-123' },
    })
    cookies = { slama_session: response.cookies[0]!.value }
  })
  afterEach(async () => {
    await app?.close()
    await fixture?.cleanup()
  })
  const company = async () => (await app.inject({ url: '/v1/company-settings', cookies })).json()
  const patch = (payload: object) =>
    app.inject({ method: 'PATCH', url: '/v1/company-settings', headers, cookies, payload })
  it('seeds only incomplete defaults, enforces singleton, validates Moroccan fields and audits updates', async () => {
    const initial = await company()
    expect(initial).toMatchObject({
      id: 1,
      legalName: null,
      currency: 'MAD',
      locale: 'fr-MA',
      timezone: 'Africa/Casablanca',
      version: 1,
    })
    await expect(fixture.client`insert into company_settings (id) values (2)`).rejects.toThrow()
    expect((await patch({ ...editable(initial), ice: '123' })).statusCode).toBe(400)
    expect(
      (await patch({ ...editable(initial), registrationNumber: '00123', registrationCity: null }))
        .statusCode,
    ).toBe(400)
    expect((await patch({ ...editable(initial), paymentDueDays: -1 })).statusCode).toBe(400)
    const saved = await patch({
      ...editable(initial),
      legalName: 'Company',
      ice: '001234567890123',
      phone: '0612345678',
      shareCapital: '10000.00',
    })
    expect(saved.statusCode).toBe(200)
    expect(saved.json()).toMatchObject({
      version: 2,
      phone: '+212612345678',
      ice: '001234567890123',
      updatedByUserId: testUserId,
    })
    const events =
      await fixture.client`select * from audit_events where entity_table='company_settings'`
    expect(events).toHaveLength(1)
    expect(events[0]!.before_values.version).toBe(1)
    expect(events[0]!.after_values.version).toBe(2)
    expect((await patch(editable(initial))).statusCode).toBe(409)
    expect((await company()).version).toBe(2)
  })
  it('rejects anonymous/read-only updates and uploads, including private signature reads', async () => {
    expect((await app.inject({ url: '/v1/company-settings' })).statusCode).toBe(403)
    const initial = await company()
    await fixture.client`delete from user_roles where user_id=${testUserId}`
    const [role] =
      await fixture.client`insert into roles (key,name) values ('settings-viewer','Viewer') returning id`
    await fixture.client`insert into user_roles (user_id,role_id) values (${testUserId},${role!.id})`
    await fixture.client`insert into role_permissions (role_id,permission_id) select ${role!.id},id from permissions where key in ('company_settings.read','templates.read')`
    expect((await app.inject({ url: '/v1/company-settings', cookies })).statusCode).toBe(200)
    expect((await patch(editable(initial))).statusCode).toBe(403)
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/media/uploads',
          headers,
          cookies,
          payload: {
            purpose: 'company_logo',
            originalFilename: 'logo.png',
            contentType: 'image/png',
            data: 'AAAA',
          },
        })
      ).statusCode,
    ).toBe(403)
    expect(
      (
        await app.inject({
          url: '/v1/media/11111111-1111-4111-8111-111111111111/download',
          cookies,
        })
      ).statusCode,
    ).toBe(404)
    await fixture.client`insert into role_permissions (role_id,permission_id) select ${role!.id},id from permissions where key='company_settings.update'`
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/media/uploads',
          headers,
          cookies,
          payload: {
            purpose: 'company_signature',
            originalFilename: 'signature.png',
            contentType: 'image/png',
            data: 'AAAA',
          },
        })
      ).statusCode,
    ).toBe(403)
  })
  it('blocks onboarding sessions from reading or writing company settings', async () => {
    const initial = await company()
    await fixture.client`update users set must_change_password=true, temporary_password_consumed_at=now() where id=${testUserId}`
    await fixture.client`update sessions set purpose='password_change' where user_id=${testUserId}`
    expect((await app.inject({ url: '/v1/auth/session', cookies })).json().purpose).toBe(
      'password_change',
    )
    for (const url of ['/v1/company-settings', '/v1/bank-accounts', '/v1/document-templates'])
      expect((await app.inject({ url, cookies })).statusCode).toBe(403)
    expect((await patch(editable(initial))).statusCode).toBe(403)
  })
  it('manages and archives bank accounts with version checks and valid identifiers', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/bank-accounts',
      headers,
      cookies,
      payload: bank,
    })
    expect(created.statusCode).toBe(201)
    const row = created.json()
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/bank-accounts',
          headers,
          cookies,
          payload: { ...bank, rib: null, iban: 'FR0020041010050500013M02606' },
        })
      ).statusCode,
    ).toBe(400)
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/bank-accounts',
          headers,
          cookies,
          payload: { ...bank, rib: null, iban: null },
        })
      ).statusCode,
    ).toBe(400)
    const updated = await app.inject({
      method: 'PATCH',
      url: `/v1/bank-accounts/${row.id}`,
      headers,
      cookies,
      payload: { ...bank, name: 'Updated account', expectedVersion: row.version },
    })
    expect(updated.statusCode).toBe(200)
    const archived = await app.inject({
      method: 'POST',
      url: `/v1/bank-accounts/${row.id}/archive`,
      headers,
      cookies,
      payload: { expectedVersion: 2 },
    })
    expect(archived.statusCode).toBe(200)
    expect(archived.json().archivedAt).toBeTruthy()
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/v1/bank-accounts/${row.id}`,
          headers,
          cookies,
          payload: { ...bank, expectedVersion: 3 },
        })
      ).statusCode,
    ).toBe(409)
    expect((await app.inject({ url: `/v1/bank-accounts/${row.id}`, cookies })).statusCode).toBe(200)
  })
  it('rolls back company changes when audit insertion fails', async () => {
    const initial = await company()
    await fixture.client.unsafe(
      `CREATE FUNCTION reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit unavailable'; END $$; CREATE TRIGGER reject_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_audit();`,
    )
    expect((await patch({ ...editable(initial), legalName: 'Must not persist' })).statusCode).toBe(
      500,
    )
    expect(await company()).toMatchObject({ legalName: null, version: 1 })
  })
  it('updates templates with version checks and rejects unsafe colors/layouts', async () => {
    const create = (payload: object) =>
      app.inject({ method: 'POST', url: '/v1/document-templates', headers, cookies, payload })
    expect(
      (await create({ ...template, accentColor: 'red; background:url(https://evil.test)' }))
        .statusCode,
    ).toBe(400)
    expect((await create({ ...template, layout: 'raw-html' })).statusCode).toBe(400)
    expect((await create({ ...template, density: 'microscopic' })).statusCode).toBe(400)
    const row = (await create(template)).json()
    expect(row.density).toBe('standard')
    const update = (payload: object) =>
      app.inject({
        method: 'PATCH',
        url: `/v1/document-templates/${row.id}`,
        headers,
        cookies,
        payload,
      })
    expect(
      (await update({ ...template, name: 'Modern', layout: 'modern', expectedVersion: 1 }))
        .statusCode,
    ).toBe(200)
    expect((await update({ ...template, expectedVersion: 1 })).statusCode).toBe(409)
    expect(
      (await app.inject({ url: `/v1/document-templates/${row.id}`, cookies })).json(),
    ).toMatchObject({ name: 'Modern', version: 2 })
    expect(
      (
        await app.inject({
          url: '/v1/document-templates/22222222-2222-4222-8222-222222222222',
          cookies,
        })
      ).statusCode,
    ).toBe(404)
  })
  it('persists all new designs and density independently with paginated previews', async () => {
    for (const layout of ['signature', 'atelier', 'ledger', 'essential']) {
      const created = await app.inject({
        method: 'POST',
        url: '/v1/document-templates',
        headers,
        cookies,
        payload: { ...template, layout, density: 'compact' },
      })
      expect(created.statusCode).toBe(201)
      const row = created.json()
      const saved = (await app.inject({ url: `/v1/document-templates/${row.id}`, cookies })).json()
      expect(saved).toMatchObject({ layout, density: 'compact', accentColor: template.accentColor })
      const preview = await app.inject({
        method: 'POST',
        url: '/v1/document-templates/preview?documentType=invoice&sampleSize=many',
        headers,
        cookies,
        payload: { ...template, layout, density: 'compact' },
      })
      expect(preview.statusCode).toBe(200)
      expect(preview.json().pageCount).toBeGreaterThan(1)
      expect(preview.json().html).toContain('Item 45')
      const updated = await app.inject({
        method: 'PATCH',
        url: `/v1/document-templates/${row.id}`,
        headers,
        cookies,
        payload: { ...template, layout, density: 'standard', expectedVersion: 1 },
      })
      expect(updated.statusCode).toBe(200)
      expect(updated.json()).toMatchObject({ layout, density: 'standard', version: 2 })
    }
  })
  it('archives the default template atomically and prevents selecting archived templates', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/document-templates',
      headers,
      cookies,
      payload: template,
    })
    expect(response.statusCode).toBe(201)
    const row = response.json()
    expect(
      (await patch({ ...editable(await company()), defaultTemplateId: row.id })).statusCode,
    ).toBe(200)
    const results = await Promise.all(
      [1, 2].map(() =>
        app.inject({
          method: 'POST',
          url: `/v1/document-templates/${row.id}/archive`,
          headers,
          cookies,
          payload: { expectedVersion: 1 },
        }),
      ),
    )
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409])
    expect(await company()).toMatchObject({ defaultTemplateId: null, version: 3 })
    expect(
      (await patch({ ...editable(await company()), defaultTemplateId: row.id })).statusCode,
    ).toBe(409)
    expect(
      (await fixture.client`select * from document_templates where id=${row.id}`)[0]!.archived_at,
    ).toBeTruthy()
    expect(await fixture.client`select * from audit_events where action='archive'`).toHaveLength(1)
  })
  it('decodes images, rejects spoofing and oversized content, retains replaced assets and escapes preview HTML', async () => {
    const bytes = await sharp({
      create: { width: 10, height: 10, channels: 4, background: '#ffffff' },
    })
      .png()
      .toBuffer()
    const upload = (data: string, contentType = 'image/png') =>
      app.inject({
        method: 'POST',
        url: '/v1/media/uploads',
        headers,
        cookies,
        payload: { purpose: 'company_logo', originalFilename: 'logo.png', contentType, data },
      })
    expect(
      (await upload(Buffer.from('<svg onload="alert(1)"></svg>').toString('base64'))).statusCode,
    ).toBe(400)
    expect((await upload(bytes.toString('base64'), 'image/jpeg')).statusCode).toBe(400)
    expect((await upload(Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64'))).statusCode).toBe(
      413,
    )
    const image = await upload(bytes.toString('base64'))
    expect(image.statusCode).toBe(201)
    const key = image.json().id
    expect((await patch({ ...editable(await company()), logoAssetId: key })).statusCode).toBe(200)
    expect((await patch({ ...editable(await company()), logoAssetId: null })).statusCode).toBe(200)
    expect(objects.has(`media/${key}.png`)).toBe(true)
    const get = await app.inject({ url: `/v1/media/${key}/download`, cookies })
    expect(get.statusCode).toBe(200)
    expect(get.headers['content-type']).toContain('image/png')
    const signature = await app.inject({
      method: 'POST',
      url: '/v1/media/uploads',
      headers,
      cookies,
      payload: {
        purpose: 'company_signature',
        originalFilename: 'signature.png',
        contentType: 'image/png',
        data: bytes.toString('base64'),
      },
    })
    expect(signature.statusCode).toBe(201)
    expect(
      (await app.inject({ url: `/v1/media/${signature.json().id}/download`, cookies })).statusCode,
    ).toBe(200)
    expect(
      (await patch({ ...editable(await company()), logoAssetId: signature.json().id })).statusCode,
    ).toBe(400)
    const preview = await app.inject({
      method: 'POST',
      url: '/v1/document-templates/preview',
      headers,
      cookies,
      payload: { ...template, logoAssetId: key, footerText: '<script>alert(1)</script>' },
    })
    expect(preview.statusCode).toBe(200)
    expect(preview.json().html).toContain('&lt;script&gt;')
    expect(preview.json().html).not.toContain('<script>')
    expect(preview.json().html).toContain('Nom du produit')
    const receiptPreview = await app.inject({
      method: 'POST',
      url: '/v1/document-templates/preview?documentType=payment_receipt',
      headers,
      cookies,
      payload: {
        ...template,
        logoAssetId: key,
        signatureAssetId: signature.json().id,
        showSignature: true,
      },
    })
    expect(receiptPreview.statusCode, receiptPreview.body).toBe(200)
    expect(receiptPreview.json().html).toContain('Reçu de paiement')
    expect(receiptPreview.json().html).toContain(
      'aria-label="Company signature" href="data:image/png;base64,',
    )
    expect(receiptPreview.json().html).toContain(
      'aria-label="Company logo" href="data:image/png;base64,',
    )
    expect(receiptPreview.json().html).not.toContain('Product name')
    expect(await fixture.client`select * from document_templates`).toHaveLength(0)
  })
  it('restores bank accounts once, checks versions and audits the transition', async () => {
    const created = (
      await app.inject({
        method: 'POST',
        url: '/v1/bank-accounts',
        cookies,
        headers,
        payload: bank,
      })
    ).json()
    const url = `/v1/bank-accounts/${created.id}`
    expect(
      (
        await app.inject({
          method: 'POST',
          url: url + '/restore',
          cookies,
          headers,
          payload: { expectedVersion: 1 },
        })
      ).statusCode,
    ).toBe(409)
    expect(
      (
        await app.inject({
          method: 'POST',
          url: url + '/archive',
          cookies,
          headers,
          payload: { expectedVersion: 1 },
        })
      ).statusCode,
    ).toBe(200)
    expect(
      (
        await app.inject({
          method: 'POST',
          url: url + '/restore',
          cookies,
          headers,
          payload: { expectedVersion: 1 },
        })
      ).json().code,
    ).toBe('STALE_VERSION')
    const results = await Promise.all(
      [1, 2].map(() =>
        app.inject({
          method: 'POST',
          url: url + '/restore',
          cookies,
          headers,
          payload: { expectedVersion: 2 },
        }),
      ),
    )
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409])
    expect((await app.inject({ url, cookies })).json()).toMatchObject({
      archivedAt: null,
      version: 3,
    })
    const audit =
      await fixture.client`select action, before_values, after_values from audit_events where action='restore'`
    expect(audit).toHaveLength(1)
    expect(audit[0]!.before_values.archivedAt).toBeTruthy()
    expect(audit[0]!.after_values.archivedAt).toBeNull()
  })
  it('deletes only unreferenced banks/templates with a version check and preserved audit', async () => {
    const account = (
      await app.inject({
        method: 'POST',
        url: '/v1/bank-accounts',
        cookies,
        headers,
        payload: bank,
      })
    ).json()
    const design = (
      await app.inject({
        method: 'POST',
        url: '/v1/document-templates',
        cookies,
        headers,
        payload: template,
      })
    ).json()
    const remove = (kind: string, id: string, expectedVersion = 1) =>
      app.inject({
        method: 'DELETE',
        url: `/v1/${kind}/${id}`,
        cookies,
        headers,
        payload: { expectedVersion },
      })
    expect((await remove('bank-accounts', account.id, 99)).json().code).toBe('STALE_VERSION')
    // Simulate the RESTRICT references required of future payment/document modules.
    await fixture.client`create table test_document_references (bank_id uuid references bank_accounts(id) on delete restrict, template_id uuid references document_templates(id) on delete restrict)`
    await fixture.client`insert into test_document_references values (${account.id}, ${design.id})`
    expect((await remove('bank-accounts', account.id)).statusCode).toBe(409)
    expect((await remove('document-templates', design.id)).statusCode).toBe(409)
    expect(await fixture.client`select id from audit_events where action='delete'`).toHaveLength(0)
    await fixture.client`delete from test_document_references`
    expect(
      (await patch({ ...editable(await company()), defaultTemplateId: design.id })).statusCode,
    ).toBe(200)
    expect((await remove('document-templates', design.id)).json().code).toBe('RECORD_IN_USE')
    expect(
      (await patch({ ...editable(await company()), defaultTemplateId: null })).statusCode,
    ).toBe(200)
    expect((await remove('bank-accounts', account.id)).statusCode).toBe(204)
    expect((await remove('document-templates', design.id)).statusCode).toBe(204)
    expect((await app.inject({ url: `/v1/bank-accounts/${account.id}`, cookies })).statusCode).toBe(
      404,
    )
    expect(
      (await app.inject({ url: `/v1/document-templates/${design.id}`, cookies })).statusCode,
    ).toBe(404)
    const audit =
      await fixture.client`select before_values, after_values from audit_events where action='delete'`
    expect(audit).toHaveLength(2)
    expect(audit.every((row) => row.before_values.id && row.after_values === null)).toBe(true)
  })
  it('rolls back deletion and restoration if auditing fails', async () => {
    const account = (
      await app.inject({
        method: 'POST',
        url: '/v1/bank-accounts',
        cookies,
        headers,
        payload: bank,
      })
    ).json()
    await app.inject({
      method: 'POST',
      url: `/v1/bank-accounts/${account.id}/archive`,
      cookies,
      headers,
      payload: { expectedVersion: 1 },
    })
    await fixture.client.unsafe(
      `CREATE FUNCTION reject_lifecycle_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit unavailable'; END $$; CREATE TRIGGER reject_lifecycle_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_lifecycle_audit();`,
    )
    for (const action of ['restore', 'delete']) {
      const response = await app.inject({
        method: action === 'restore' ? 'POST' : 'DELETE',
        url: `/v1/bank-accounts/${account.id}${action === 'restore' ? '/restore' : ''}`,
        cookies,
        headers,
        payload: { expectedVersion: 2 },
      })
      expect(response.statusCode).toBe(500)
      const current = (await app.inject({ url: `/v1/bank-accounts/${account.id}`, cookies })).json()
      expect(current.version).toBe(2)
      expect(current.archivedAt).toBeTruthy()
    }
  })
})
