import { createHash, randomUUID } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/env.js'
import type { ObjectStorage } from '../src/integrations/contracts.js'
import { createRecordingEmailProvider } from '../src/integrations/email/transport.js'
import { companyDate } from '../src/lib/validation.js'
import { createClientNotificationModule } from '../src/modules/clients/index.js'
import { createPasswordService } from '../src/modules/identity/auth/services/password.service.js'
import { createMediaModule } from '../src/modules/media/index.js'
import { createSalesModule, createSalesNotificationsModule } from '../src/modules/sales/index.js'
import { createNotificationSettingsModule } from '../src/modules/settings/index.js'
import { createNotificationSupport } from '../src/support/notifications/index.js'
import { isolatedDatabase, testUserId } from './helpers/postgres.js'

const clientId = '33333333-3333-4333-8333-333333333333'
const headers = { origin: 'http://localhost:5173' }

describe('consent-aware sales notifications', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let app: Awaited<ReturnType<typeof buildApp>>
  let cookies: { slama_session: string }
  const files = new Map<string, Uint8Array>()
  const storage: ObjectStorage = {
    async putImmutable({ key, bytes, contentType }) {
      files.set(key, bytes)
      return {
        key,
        byteSize: bytes.byteLength,
        contentType,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      }
    },
    async get(key) {
      const data = files.get(key)
      if (!data) throw new Error('Missing test object')
      return data
    },
    async deleteUnreferenced(key) {
      files.delete(key)
    },
    async signedDownloadUrl() {
      throw new Error('Not used')
    },
    async list() {
      return []
    },
  }
  const post = (url: string, payload: object) =>
    app.inject({ method: 'POST', url, headers, cookies, payload })
  const get = (url: string) => app.inject({ method: 'GET', url, headers, cookies })
  const patch = (url: string, payload: object) =>
    app.inject({ method: 'PATCH', url, headers, cookies, payload })
  beforeEach(async () => {
    files.clear()
    fixture = await isolatedDatabase()
    await fixture.client`update company_settings set legal_name='Slama',address_line1='Rue Atlas',city='Casablanca' where id=1`
    await fixture.client`insert into clients(id,type,legal_name,address_line1,city,email) values (${clientId},'company','Client SARL','Rue Hassan','Rabat','client@example.test')`
    const hash = await createPasswordService().hash('notifications-password-123')
    await fixture.client`update users set password_hash=${hash} where id=${testUserId}`
    await fixture.client`insert into user_roles(user_id,role_id) select ${testUserId},id from roles where key='admin'`
    app = await buildApp({
      environment: loadEnvironment({ NODE_ENV: 'test' }),
      logger: false,
      mediaStorage: storage,
    })
    app.database = () => fixture.db
    const login = await post('/v1/auth/login', {
      email: 'operator@example.test',
      password: 'notifications-password-123',
    })
    expect(login.statusCode, login.body).toBe(200)
    cookies = { slama_session: login.cookies[0]!.value }
  })
  afterEach(async () => {
    await app?.close()
    await fixture?.cleanup()
  })
  async function rule(event: string, enabled = true, extra: object = {}) {
    const list = await get('/v1/notification-rules')
    expect(list.statusCode, list.body).toBe(200)
    const r = list.json().items.find((row: { eventKey: string }) => row.eventKey === event)
    const update = await patch(`/v1/notification-rules/${r.id}`, {
      expectedVersion: r.version,
      enabled,
      offsetDays: 0,
      repeatEveryDays: null,
      senderName: r.senderName,
      senderEmail: r.senderEmail,
      locale: r.locale,
      subjectTemplate: r.subjectTemplate,
      bodyTemplate: r.bodyTemplate,
      bodyFormat: r.bodyFormat,
      ...extra,
    })
    expect(update.statusCode, update.body).toBe(200)
    return update.json()
  }
  async function document(type: 'invoice' | 'estimate', date = companyDate(new Date())) {
    const input = {
      clientId,
      templateId: null,
      issueDate: date,
      notes: null,
      paymentTerms: null,
      lines: [
        {
          productVariantId: null,
          productName: 'Wheat',
          quantity: 1,
          unitPrice: '100.00',
          vatRate: null,
        },
      ],
      ...(type === 'invoice' ? { dueDate: date } : { validUntil: date }),
    }
    const draft = await post(`/v1/${type}s`, input)
    expect(draft.statusCode, draft.body).toBe(201)
    const issued = await post(`/v1/${type}s/${draft.json().id}/issue`, { expectedVersion: 1 })
    expect(issued.statusCode, issued.body).toBe(200)
    return issued.json()
  }
  it('previews unsaved HTML without sending, persists sanitized HTML and tests only to the operator', async () => {
    const r = await rule('invoice_sent', false, {
      bodyFormat: 'text',
      bodyTemplate: 'Bonjour {{clientName}}',
    })
    const template = {
      bodyFormat: 'html',
      subjectTemplate: 'Document {{documentNumber}}',
      bodyTemplate:
        '<h2>Bonjour {{clientName}}</h2><p>{{total}} {{currency}}</p><script>bad()</script>',
    }
    const preview = await post(`/v1/notification-rules/${r.id}/preview`, template)
    expect(preview.statusCode, preview.body).toBe(200)
    expect(preview.json().html).toContain('<h2>Bonjour Client Exemple</h2>')
    expect(preview.json().html).not.toContain('<script>')
    expect(preview.json().modified).toBe(true)
    expect(
      (await fixture.client`select count(*)::int as count from outbound_messages`)[0]!.count,
    ).toBe(0)
    expect(
      (await get('/v1/notification-rules'))
        .json()
        .items.find((item: { id: string }) => item.id === r.id).bodyFormat,
    ).toBe('text')
    const saved = await rule('invoice_sent', false, template)
    expect(saved.bodyFormat).toBe('html')
    expect(saved.bodyTemplate).not.toContain('<script>')
    const test = await post(`/v1/notification-rules/${r.id}/test`, {})
    expect(test.statusCode, test.body).toBe(202)
    const [message] =
      await fixture.client`select * from outbound_messages where id=${test.json().messageId}`
    expect(JSON.stringify(message)).toContain('<h2>Bonjour Client Exemple</h2>')
    expect(JSON.stringify(message)).toContain('operator@example.test')
    expect(JSON.stringify(message)).not.toContain('client@example.test')
    expect(JSON.stringify(message)).not.toContain('<script>')
    expect(message!.html).toBe(preview.json().html)
    const invalid = await post(`/v1/notification-rules/${r.id}/preview`, {
      ...template,
      bodyTemplate: '{{paymentNumber}}',
    })
    expect(invalid.statusCode).toBe(400)
    const unauthorized = await app.inject({
      method: 'POST',
      url: `/v1/notification-rules/${r.id}/preview`,
      headers,
      payload: template,
    })
    expect(unauthorized.statusCode).toBe(403) // Missing session is rejected by the CSRF guard first.
    await fixture.client`delete from role_permissions where permission_id in (select id from permissions where key='notification_rules.update')`
    const forbidden = await post(`/v1/notification-rules/${r.id}/preview`, template)
    expect(forbidden.statusCode).toBe(403)
  })
  function workers(now = new Date(Date.now() + 5000)) {
    const provider = createRecordingEmailProvider()
    const transport = createNotificationSupport(() => fixture.db, storage, provider, {
      allowedFrom: ['notifications@example.invalid'],
      clock: () => now,
    })
    const policies = createNotificationSettingsModule(() => fixture.db, transport, {
      allowedFrom: ['notifications@example.invalid'],
    })
    const clients = createClientNotificationModule(() => fixture.db, policies.publicApi)
    const sales = createSalesModule(
      () => fixture.db,
      storage,
      createMediaModule(() => fixture.db, storage).publicApi,
    )
    const producer = createSalesNotificationsModule(
      () => fixture.db,
      transport,
      policies.publicApi,
      clients.publicApi,
      sales.prepareNotificationAttachment,
      { clock: () => now },
    )
    return { provider, transport, producer }
  }
  it('resolves bilingual content from company language and honors explicit rule overrides', async () => {
    const { transport } = workers()
    const policies = createNotificationSettingsModule(() => fixture.db, transport, {
      allowedFrom: ['notifications@example.invalid'],
    }).publicApi
    const saved = await rule('invoice_sent', true, {
      locale: 'company',
      englishSubjectTemplate: 'Invoice {{documentNumber}}',
      englishBodyTemplate: '<p>Hello {{clientName}}</p>',
    })
    expect((await policies.rule('invoice_sent')).locale).toBe('fr-MA')
    await fixture.client`update company_settings set locale='en-GB' where id=1`
    expect(await policies.rule('invoice_sent')).toMatchObject({
      locale: 'en-GB',
      subjectTemplate: 'Invoice {{documentNumber}}',
      bodyTemplate: '<p>Hello {{clientName}}</p>',
      bodyFormat: 'html',
    })
    await fixture.client`update notification_rules set locale='fr-MA' where id=${saved.id}`
    expect((await policies.rule('invoice_sent')).locale).toBe('fr-MA')
  })
  it('defaults disabled, inherits and resets overrides with first-create concurrency protection', async () => {
    const initial = await get(`/v1/clients/${clientId}/notification-preferences`)
    expect(
      initial.json().items.every((r: { reason: string }) => r.reason === 'RULE_DISABLED'),
    ).toBe(true)
    const r = await rule('invoice_sent')
    const url = `/v1/clients/${clientId}/notification-preferences/${r.id}`
    const writes = await Promise.all(
      [false, true].map((enabled) =>
        app.inject({
          method: 'PUT',
          url,
          headers,
          cookies,
          payload: { expectedVersion: 0, enabled, cc: [] },
        }),
      ),
    )
    expect(writes.map((r) => r.statusCode).sort()).toEqual([200, 409])
    const current = (await get(`/v1/clients/${clientId}/notification-preferences`))
      .json()
      .items.find((p: { ruleId: string }) => p.ruleId === r.id)
    const reset = await app.inject({
      method: 'DELETE',
      url,
      headers,
      cookies,
      payload: { expectedVersion: current.version },
    })
    expect(reset.statusCode, reset.body).toBe(204)
    const after = (await get(`/v1/clients/${clientId}/notification-preferences`))
      .json()
      .items.find((p: { ruleId: string }) => p.ruleId === r.id)
    expect(after).toMatchObject({ version: 0, overrideEnabled: null, effectiveEnabled: true })
  })
  it('requests are idempotent, accepted outcomes reconcile once and preserve printable content', async () => {
    await rule('invoice_sent')
    const doc = await document('invoice')
    const input = { expectedVersion: doc.version, requestId: randomUUID() }
    const first = await post(`/v1/invoices/${doc.id}/send`, input)
    expect(first.statusCode, first.body).toBe(202)
    const second = await post(`/v1/invoices/${doc.id}/send`, input)
    expect(second.json().jobId).toBe(first.json().jobId)
    expect(
      (await post(`/v1/invoices/${doc.id}/send`, { ...input, expectedVersion: doc.version + 1 }))
        .statusCode,
    ).toBe(409)
    const w = workers()
    await w.producer.worker.runOne()
    const [job] =
      await fixture.client`select status,last_error_code from background_jobs where id=${first.json().jobId}`
    expect(job, JSON.stringify(job)).toMatchObject({ status: 'succeeded' })
    await w.transport.worker.runOne()
    await w.producer.sweep()
    await w.producer.sweep()
    const [row] =
      await fixture.client`select status,sent_at,version,content_version from invoices where id=${doc.id}`
    expect(row).toMatchObject({
      status: 'sent',
      version: doc.version + 1,
      content_version: doc.contentVersion,
    })
    expect(row?.sent_at).toBeTruthy()
    expect(w.provider.messages).toHaveLength(1)
    const timeline = await get(`/v1/documents/invoice/${doc.id}/notifications`)
    expect(timeline.statusCode, timeline.body).toBe(200)
    expect(
      timeline
        .json()
        .items.map((r: { kind: string }) => r.kind)
        .sort(),
    ).toEqual(['dispatch', 'preparation'])
  })
  it('disabled policy cancels ready work transactionally and owner substitution is denied', async () => {
    await rule('invoice_sent')
    const doc = await document('invoice')
    const request = await post(`/v1/invoices/${doc.id}/send`, {
      expectedVersion: doc.version,
      requestId: randomUUID(),
    })
    expect(request.statusCode, request.body).toBe(202)
    const w = workers()
    await w.producer.worker.runOne()
    const [d] =
      await fixture.client`select id,message_id from notification_dispatches where source_id=${doc.id}`
    expect(d).toBeTruthy()
    const other = await document('invoice')
    const bad = await post(`/v1/documents/invoice/${other.id}/notifications/${d!.id}/cancel`, {})
    expect(bad.statusCode, bad.body).toBe(404)
    await rule('invoice_sent', false)
    expect(await w.transport.status(d!.message_id)).toMatchObject({ status: 'cancelled' })
    expect(await w.transport.worker.runOne()).toBe(false)
    expect(w.provider.messages).toHaveLength(0)
  })
  it('expiry only transitions issued/sent estimates once and preserves printable content and accepted state', async () => {
    const issued = await document('estimate', '2026-01-01')
    const accepted = await document('estimate', '2026-01-01')
    const accept = await post(`/v1/estimates/${accepted.id}/accept`, {
      expectedVersion: accepted.version,
    })
    expect(accept.statusCode, accept.body).toBe(200)
    const w = workers(new Date('2026-01-03T12:00:00Z'))
    expect((await w.producer.sweep()).expired).toBe(1)
    expect((await w.producer.sweep()).expired).toBe(0)
    const [row] =
      await fixture.client`select status,expired_at,version,content_version from estimates where id=${issued.id}`
    expect(row).toMatchObject({
      status: 'expired',
      version: issued.version + 1,
      content_version: issued.contentVersion,
    })
    expect(row?.expired_at).toBeTruthy()
    const [other] = await fixture.client`select status from estimates where id=${accepted.id}`
    expect(other?.status).toBe('accepted')
  })
  it('payment confirmation notifies once without issuing a receipt and restoration never replays', async () => {
    await rule('payment_received')
    const invoice = await document('invoice')
    const today = companyDate(new Date())
    const result = await post('/v1/payments', {
      operationId: randomUUID(),
      invoiceId: invoice.id,
      amount: '50.00',
      currency: 'MAD',
      method: 'cash',
      status: 'confirmed',
      paymentDate: today,
      collectedOn: today,
      bankAccountId: null,
      reference: null,
      chequeBank: null,
      chequeNumber: null,
    })
    expect(result.statusCode, result.body).toBe(201)
    const id = result.json().id
    const [first] =
      await fixture.client`select count(*)::int as total from notification_dispatches where source_type='payment' and source_id=${id}`
    expect(first?.total).toBe(1)
    const [payment] = await fixture.client`select receipt_issued_at from payments where id=${id}`
    expect(payment?.receipt_issued_at).toBeNull()
    const cancel = await post(`/v1/payments/${id}/cancel`, {
      expectedVersion: 1,
      reason: 'Test correction',
    })
    expect(cancel.statusCode, cancel.body).toBe(200)
    const restore = await post(`/v1/payments/${id}/restore`, {
      expectedVersion: cancel.json().version,
    })
    expect(restore.statusCode, restore.body).toBe(200)
    const [last] =
      await fixture.client`select count(*)::int as total from notification_dispatches where source_type='payment' and source_id=${id}`
    expect(last?.total).toBe(1)
  })
  it('repeated reminders and same-day policy edits do not duplicate, and settlement cancels ready reminders', async () => {
    await rule('invoice_due_reminder', true, { repeatEveryDays: 1 })
    const invoice = await document('invoice')
    const w = workers()
    expect((await w.producer.sweep()).reminders).toBe(1)
    expect((await w.producer.sweep()).reminders).toBe(0)
    await rule('invoice_due_reminder', true, {
      repeatEveryDays: 1,
      bodyTemplate: 'Updated {{clientName}} {{outstanding}}',
    })
    expect((await w.producer.sweep()).reminders).toBe(0)
    const [dispatch] =
      await fixture.client`select message_id from notification_dispatches where source_id=${invoice.id} and event_key='invoice_due_reminder'`
    const today = companyDate(new Date())
    const payment = await post('/v1/payments', {
      operationId: randomUUID(),
      invoiceId: invoice.id,
      amount: '100.00',
      currency: 'MAD',
      method: 'cash',
      status: 'confirmed',
      paymentDate: today,
      collectedOn: today,
      bankAccountId: null,
      reference: null,
      chequeBank: null,
      chequeNumber: null,
    })
    expect(payment.statusCode, payment.body).toBe(201)
    expect(await w.transport.status(dispatch!.message_id)).toMatchObject({ status: 'cancelled' })
    expect((await w.producer.sweep()).reminders).toBe(0)
  })
  it('revision issue cancels predecessor preparation and never reverses supersession', async () => {
    await rule('estimate_sent')
    const estimate = await document('estimate')
    const send = await post(`/v1/estimates/${estimate.id}/send`, {
      expectedVersion: estimate.version,
      requestId: randomUUID(),
    })
    expect(send.statusCode, send.body).toBe(202)
    const revision = await post(`/v1/estimates/${estimate.id}/revisions`, {
      expectedVersion: estimate.version,
    })
    expect(revision.statusCode, revision.body).toBe(200)
    const issue = await post(`/v1/estimates/${revision.json().id}/issue`, {
      expectedVersion: revision.json().version,
    })
    expect(issue.statusCode, issue.body).toBe(200)
    const [job] =
      await fixture.client`select status from background_jobs where id=${send.json().jobId}`
    expect(job?.status).toBe('cancelled')
    const w = workers()
    expect(await w.producer.worker.runOne()).toBe(false)
    const [source] = await fixture.client`select status from estimates where id=${estimate.id}`
    expect(source?.status).toBe('superseded')
    expect(w.provider.messages).toHaveLength(0)
  })
})
