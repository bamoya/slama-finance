import { createHash, randomUUID } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/env.js'
import {
  ReportAnalysisSchema,
  ReportFiltersSchema,
} from '../src/contracts/generated/reporting/reporting.schemas.js'
import type { ObjectStorage } from '../src/integrations/contracts.js'
import { createPasswordService } from '../src/modules/identity/auth/services/password.service.js'
import { createIdentityModule } from '../src/modules/identity/index.js'
import { createReportingModule } from '../src/modules/reporting/index.js'
import { createReportingReadRepository } from '../src/modules/sales/shared/repositories/reporting-read.repository.js'
import { createNotificationSupport } from '../src/support/notifications/index.js'
import { isolatedDatabase, testUserId } from './helpers/postgres.js'

const headers = { origin: 'http://localhost:5173' }
describe('Live and frozen reporting', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>,
    app: Awaited<ReturnType<typeof buildApp>>,
    cookies: { slama_session: string },
    clientId: string,
    invoiceId: string,
    hash: string
  const objects = new Map<string, Uint8Array>()
  let failDeletion = false
  const storage: ObjectStorage = {
    async putImmutable(input) {
      objects.set(input.key, input.bytes)
      return {
        key: input.key,
        contentType: input.contentType,
        byteSize: input.bytes.length,
        sha256: createHash('sha256').update(input.bytes).digest('hex'),
      }
    },
    async get(key) {
      return objects.get(key)!
    },
    async signedDownloadUrl() {
      return 'unused'
    },
    async deleteUnreferenced(key) {
      if (failDeletion) throw new Error('Storage temporarily unavailable')
      objects.delete(key)
    },
  }
  beforeEach(async () => {
    failDeletion = false
    objects.clear()
    fixture = await isolatedDatabase()
    hash = await createPasswordService().hash('reporting-password-123')
    await fixture.client`update users set password_hash=${hash} where id=${testUserId}`
    await fixture.client`insert into user_roles(user_id,role_id) select ${testUserId},id from roles where key='admin'`
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
      payload: { email: 'operator@example.test', password: 'reporting-password-123' },
    })
    cookies = { slama_session: login.cookies[0]!.value }
    const [client] =
      await fixture.client`insert into clients(type,legal_name,address_line1,city) values('company',' =SUM(1,1)','Atlas','Casablanca') returning id`
    clientId = client!.id as string
    const invoice = async (
      number: string,
      status: string,
      currency: string,
      date: string,
      total: string,
      net = total,
      tax = '0.00',
    ) => {
      const [row] =
        await fixture.client`insert into invoices(number,status,client_id,issue_date,due_date,currency,issuer_snapshot,client_snapshot,appearance_snapshot,subtotal,tax_total,total,issued_at) values(${number},${status},${clientId},${date}::date,'2026-01-01',${currency},'{}','{"legalName":" =SUM(1,1)"}','{}',${net},${tax},${total},'2026-09-01T12:00:00Z') returning id`
      return row!.id as string
    }
    invoiceId = await invoice(
      'INV-REPORT-MAD',
      'issued',
      'MAD',
      '2026-09-15',
      '120.00',
      '100.00',
      '20.00',
    )
    await invoice('INV-REPORT-EUR', 'sent', 'EUR', '2026-09-16', '50.00')
    await invoice('INV-REPORT-CANCEL', 'cancelled', 'MAD', '2026-09-17', '900.00')
    const prior = await invoice('INV-REPORT-PRIOR', 'issued', 'MAD', '2026-08-15', '40.00')
    await fixture.client`insert into invoices(status,client_id,issue_date,currency,issuer_snapshot,client_snapshot,appearance_snapshot,total,subtotal,tax_total) values('draft',${clientId},'2026-09-18','MAD','{}','{}','{}','1000','1000','0')`
    const [category] =
      await fixture.client`insert into product_categories(name) values('Grains') returning id`
    const product = await fixture.client.begin(async (tx) => {
      const [row] =
        await tx`insert into products(reference,name,category_id) values('REPORT-GRAIN','Grain',${category!.id}) returning id`
      await tx`insert into product_variants(product_id,weight_g,price_per_item) values(${row!.id},500,'25.00')`
      return row
    })
    await fixture.client`insert into invoice_lines(invoice_id,product_id,position,product_name,package_weight_g,quantity,unit_price,vat_rate,net_amount,tax_amount,total_amount) values(${invoiceId},${product!.id},0,'Grain',500,2,'25','20','50','10','60')`
    await fixture.client`insert into invoice_lines(invoice_id,position,product_name,quantity,unit_price,vat_rate,net_amount,tax_amount,total_amount) values(${invoiceId},1,'Manual line',1,'50','20','50','10','60')`
    const [original] =
      await fixture.client`insert into estimates(number,status,client_id,issue_date,valid_until,currency,issuer_snapshot,client_snapshot,appearance_snapshot,issued_at,accepted_at) values('EST-REPORT-ORIGINAL','superseded',${clientId},'2026-09-01','2026-09-30','MAD','{}','{}','{}','2026-09-01T12:00:00Z','2026-09-02T12:00:00Z') returning id`
    await fixture.client`insert into estimates(number,status,revision_of_id,client_id,issue_date,valid_until,currency,issuer_snapshot,client_snapshot,appearance_snapshot,issued_at) values('EST-REPORT-REVISION','issued',${original!.id},${clientId},'2026-09-03','2026-10-30','MAD','{}','{}','{}','2026-09-03T12:00:00Z')`
    await fixture.client`update invoices set source_estimate_id=${original!.id},conversion_operation_id=gen_random_uuid(),conversion_request='{}' where number in ('INV-REPORT-MAD','INV-REPORT-EUR')`
    for (const [index, id, amount, collected, status, method] of [
      [1, invoiceId, '30.00', '2026-09-15', 'confirmed', 'cash'],
      [2, invoiceId, '20.00', '2026-09-25', 'confirmed', 'bank_transfer'],
      [3, prior, '10.00', '2026-09-26', 'confirmed', 'cash'],
      [4, invoiceId, '10.00', null, 'pending', 'cheque'],
      [5, invoiceId, '15.00', '2026-09-01', 'cancelled', 'cash'],
    ] as const) {
      await fixture.client`insert into payments(number,operation_id,creation_request,invoice_id,amount,currency,method,status,payment_date,collected_on,confirmed_at,cancelled_at,cancellation_reason,reference,cheque_bank,cheque_number) values(${`PAY-REPORT-${index}`},${randomUUID()},'{}',${id},${amount},'MAD',${method},${status},'2026-09-01',${collected}::date,${status === 'confirmed' ? '2026-10-01T12:00:00Z' : null}::timestamptz,${status === 'cancelled' ? '2026-10-01T12:00:00Z' : null}::timestamptz,${status === 'cancelled' ? 'Cancelled' : null},${method === 'bank_transfer' ? 'BANK-REPORT' : null},${method === 'cheque' ? 'BANK' : null},${method === 'cheque' ? 'CHEQUE-REPORT' : null})`
    }
    for (const [number, status, quantity] of [
      ['DEL-REPORT-P', 'prepared', 2],
      ['DEL-REPORT-D', 'delivered', 4],
    ] as const) {
      const [delivery] =
        await fixture.client`insert into delivery_notes(number,client_id,status,delivery_date,issuer_snapshot,client_snapshot,delivery_address) values(${number},${clientId},${status},'2026-09-20','{}','{}','Atlas') returning id`
      await fixture.client`insert into delivery_note_lines(delivery_note_id,product_id,position,product_name,package_weight_g,quantity) values(${delivery!.id},${product!.id},0,'Grain',500,${quantity})`
    }
  })
  afterEach(async () => {
    await app?.close()
    await fixture?.cleanup()
    objects.clear()
  })
  const get = (url: string) => app.inject({ method: 'GET', url, cookies })
  const post = (url: string, payload: object) =>
    app.inject({ method: 'POST', url, cookies, headers, payload })
  const criteria = 'from=2026-09-01&to=2026-09-30&timezone=Africa%2FCasablanca'
  it('captures company language per run, while explicit overrides and prior runs remain unchanged', async () => {
    await fixture.client`update company_settings set locale='en-GB' where id=1`
    const input = {
      name: 'Inherited language',
      frequency: 'weekly',
      weekday: 1,
      monthDay: null,
      localTime: '08:00',
      timezone: 'Africa/Casablanca',
      period: 'previous_week',
      includedSections: ['summary'],
      recipientIds: [testUserId],
      enabled: false,
    }
    const response = await post('/v1/report-schedules', input)
    expect(response.statusCode, response.body).toBe(201)
    const saved = response.json()
    expect(saved.language).toBe('company')
    const run = await post(`/v1/report-schedules/${saved.id}/test-email`, {
      expectedVersion: saved.version,
    })
    expect(run.statusCode, run.body).toBe(202)
    expect(run.json().configurationSnapshot.language).toBe('en')
    await fixture.client`update company_settings set locale='fr-MA' where id=1`
    const frozen = await get(`/v1/report-runs/${run.json().id}`)
    expect(frozen.statusCode, frozen.body).toBe(200)
    expect(frozen.json().configurationSnapshot.language).toBe('en')
    const override = await post('/v1/report-schedules', { ...input, language: 'en' })
    expect(override.statusCode, override.body).toBe(201)
    const explicitRun = await post(`/v1/report-schedules/${override.json().id}/test-email`, {
      expectedVersion: override.json().version,
    })
    expect(explicitRun.json().configurationSnapshot.language).toBe('en')
  })
  it('queues a self-only test on a disabled schedule, deduplicates clicks and preserves automatic scheduling', async () => {
    const input = {
      name: 'Test weekly finance',
      language: 'fr',
      frequency: 'weekly',
      weekday: 1,
      monthDay: null,
      localTime: '08:00',
      timezone: 'Africa/Casablanca',
      period: 'previous_week',
      includedSections: ['summary'],
      recipientIds: [testUserId],
      enabled: false,
    }
    const created = await post('/v1/report-schedules', input)
    expect(created.statusCode, created.body).toBe(201)
    const schedule = created.json()
    const url = `/v1/report-schedules/${schedule.id}/test-email`
    const [first, repeated] = await Promise.all([
      post(url, { expectedVersion: schedule.version }),
      post(url, { expectedVersion: schedule.version }),
    ])
    expect(first.statusCode, first.body).toBe(202)
    expect(repeated.statusCode, repeated.body).toBe(202)
    expect(first.json()).toMatchObject({
      trigger: 'test',
      status: 'queued',
      configurationSnapshot: { language: 'fr', recipientIds: [testUserId] },
    })
    expect(repeated.json().id).toBe(first.json().id)
    const saved = (await get(`/v1/report-schedules/${schedule.id}`)).json()
    expect(saved).toEqual(schedule)
    expect((await post(url, { expectedVersion: 999 })).statusCode).toBe(409)
    expect((await post(url, { expectedVersion: schedule.version })).statusCode).toBe(429)
    const [count] =
      await fixture.client`select count(*)::int as total from report_runs where schedule_id=${schedule.id}`
    expect(count!.total).toBe(1)
  })
  it.each(['pdf', 'excel', 'both'] as const)(
    'delivers selected %s files only to its requester; frozen configuration is respected',
    async (output) => {
      const notifications = createNotificationSupport(
        () => fixture.db,
        storage,
        {
          supportsIdempotency: true,
          async send() {
            throw new Error('No external mail in integration tests')
          },
        },
        { allowedFrom: ['reports@example.test'] },
      )
      const identity = createIdentityModule({
        database: () => fixture.db,
        ttlDays: 1,
        secure: false,
      }).publicApi
      const reporting = createReportingModule({
        database: () => fixture.db,
        sales: createReportingReadRepository(() => fixture.db),
        identity,
        storage,
        notifications,
        sender: { email: 'reports@example.test', name: 'Slama' },
        uiOrigin: 'http://localhost:5173',
      })
      const created = await post('/v1/report-schedules', {
        name: 'Disabled weekly test',
        output,
        language: 'en',
        frequency: 'weekly',
        weekday: 1,
        monthDay: null,
        localTime: '08:00',
        timezone: 'Africa/Casablanca',
        period: 'previous_week',
        includedSections: ['summary'],
        recipientIds: [testUserId],
        enabled: false,
      })
      const schedule = created.json()
      const accepted = await post(`/v1/report-schedules/${schedule.id}/test-email`, {
        expectedVersion: schedule.version,
      })
      expect(accepted.statusCode, accepted.body).toBe(202)
      await fixture.client`update report_schedules set language='fr',output='pdf' where id=${schedule.id}`
      expect(await reporting.worker.runOne()).toBe(true)
      expect(await reporting.worker.runOne()).toBe(false)
      const result = (await get(`/v1/report-runs/${accepted.json().id}`)).json()
      expect(result).toMatchObject({
        trigger: 'test',
        status: 'succeeded',
        configurationSnapshot: { language: 'en', recipientIds: [testUserId] },
      })
      expect(result.artifacts).toHaveLength(output === 'both' ? 2 : 1)
      expect(result.configurationSnapshot.output).toBe(output)
      const messages = await fixture.client`select * from outbound_messages`
      expect(messages).toHaveLength(1)
      expect(messages[0]).toMatchObject({
        to_address: 'operator@example.test',
        subject: '[TEST] Your scheduled financial report',
        status: 'queued',
      })
      expect(messages[0]!.html).toContain('<html lang="en">')
      const attachments =
        await fixture.client`select * from outbound_message_attachments where message_id=${messages[0]!.id}`
      expect(attachments).toHaveLength(output === 'both' ? 2 : 1)
      expect(attachments.map((item) => item.filename.split('.').at(-1)).sort()).toEqual(
        output === 'both' ? ['pdf', 'xlsx'] : [output === 'excel' ? 'xlsx' : 'pdf'],
      )
      for (const attachment of attachments) expect(objects.get(attachment.object_key)).toBeTruthy()
      expect((await get(`/v1/report-schedules/${schedule.id}`)).json().nextRunAt).toBeNull()
      const archived = await post(`/v1/report-schedules/${schedule.id}/archive`, {
        expectedVersion: schedule.version,
      })
      expect(archived.statusCode).toBe(200)
      expect(
        (
          await post(`/v1/report-schedules/${schedule.id}/test-email`, {
            expectedVersion: archived.json().version,
          })
        ).statusCode,
      ).toBe(409)
      await fixture.client`delete from user_roles where user_id=${testUserId}`
      expect(
        (
          await post(`/v1/report-schedules/${schedule.id}/test-email`, {
            expectedVersion: archived.json().version,
          })
        ).statusCode,
      ).toBe(403)
    },
  )
  it('shares definitions, keeps currency totals separate, avoids payment/line fan-out and labels capture balances', async () => {
    const sections =
      'summary,revenue,collections,outstanding,overdue,payment_methods,pending_cheques,vat,sales_by_client,sales_by_product,sales_by_category,estimates,deliveries'
    await fixture.db.transaction((tx) =>
      createReportingReadRepository(() => fixture.db).capture(
        ReportFiltersSchema.parse({
          from: '2026-09-01',
          to: '2026-09-30',
          timezone: 'Africa/Casablanca',
          sections: sections.split(','),
          start: '2026-08-31T23:00:00Z',
          endExclusive: '2026-09-30T23:00:00Z',
        }),
        tx,
        undefined,
        '2026-10-03',
      ),
    )
    const analysis = await get(`/v1/reports/analysis?${criteria}&sections=${sections}&limit=1`)
    expect(analysis.statusCode, analysis.body).toBe(200)
    const data = ReportAnalysisSchema.parse(analysis.json())
    const dashboard = await get(`/v1/dashboard?${criteria}&sections=${sections}&limit=1`)
    expect(dashboard.statusCode, dashboard.body).toBe(200)
    expect(dashboard.json().sections).toEqual(data.sections)
    const section = (key: string) => data.sections.find((item) => item.key === key)!
    const metric = (key: string, name: string, currency = 'MAD') =>
      section(key).metrics.find((item) => item.key === name && item.currency === currency)?.value
    expect(data.currencies).toEqual(['EUR', 'MAD'])
    expect(metric('summary', 'invoiced_gross')).toBe('120.00')
    expect(metric('summary', 'collections')).toBe('60.00')
    expect(metric('summary', 'outstanding')).toBe('100.00')
    expect(metric('revenue', 'gross', 'EUR')).toBe('50.00')
    expect(section('revenue')).toMatchObject({ total: 2, rows: [expect.any(Object)] })
    expect(metric('pending_cheques', 'amount')).toBe('10.00')
    expect(metric('outstanding', 'amount')).toBe('100.00')
    expect(metric('vat', 'vat')).toBe('20.00')
    expect(metric('estimates', 'issued_count')).toBe('2')
    expect(metric('estimates', 'accepted_count')).toBe('1')
    expect(metric('estimates', 'converted_estimate_count')).toBe('1')
    expect(metric('estimates', 'converted_invoice_count')).toBe('1')
    expect(metric('estimates', 'converted_invoice_count', 'EUR')).toBe('1')
    expect(metric('estimates', 'expired_count')).toBeUndefined()
    expect(data.snapshotVersion).toBe(3)
    expect(
      section('outstanding')
        .visuals!.filter((point) => point.currency === 'MAD')
        .reduce((sum, point) => sum + Number(point.value), 0),
    ).toBe(100)
    expect(section('estimates').visuals).toContainEqual(
      expect.objectContaining({ group: 'cohort', key: 'invoiced', currency: 'MAD', value: '1' }),
    )
    expect(section('sales_by_client').visuals).toContainEqual(
      expect.objectContaining({ group: 'buyer_type', key: 'repeat', currency: 'MAD', value: '1' }),
    )
    expect(section('sales_by_product').visuals).toContainEqual(
      expect.objectContaining({ group: 'variants', key: 'manual', unit: 'count', value: '3' }),
    )
    expect(
      section('sales_by_product').rows.some((row) => row.id === 'manual' || row.weightKg !== null),
    ).toBe(true)
    expect(section('deliveries').metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'planned_weight_kg',
          value: expect.stringMatching(/^1\.0/),
        }),
        expect.objectContaining({
          key: 'delivered_weight_kg',
          value: expect.stringMatching(/^2\.0/),
        }),
      ]),
    )
  })
  it('grants every section with reports.read, revokes all access without it, and rejects unsupported filters', async () => {
    const id = randomUUID()
    const [role] =
      await fixture.client`insert into roles(key,name) values('report-limited','Limited reports') returning id`
    await fixture.client`insert into users(id,email,password_hash,must_change_password) values(${id},'limited@example.test',${hash},false)`
    await fixture.client`insert into user_roles(user_id,role_id) values(${id},${role!.id})`
    await fixture.client`insert into role_permissions(role_id,permission_id) select ${role!.id},id from permissions where key='reports.read'`
    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers,
      payload: { email: 'limited@example.test', password: 'reporting-password-123' },
    })
    const limited = { slama_session: login.cookies[0]!.value }
    const denied = await app.inject({
      method: 'GET',
      url: `/v1/reports/analysis?${criteria}&sections=summary`,
      cookies: limited,
    })
    expect(denied.statusCode).toBe(200)
    const empty = await app.inject({
      method: 'GET',
      url: `/v1/dashboard?${criteria}`,
      cookies: limited,
    })
    expect(empty.statusCode, empty.body).toBe(200)
    expect(empty.json().sections).toHaveLength(13)
    await fixture.client`delete from role_permissions where role_id=${role!.id}`
    const revoked = await app.inject({
      method: 'GET',
      url: `/v1/dashboard?${criteria}`,
      cookies: limited,
    })
    expect(revoked.statusCode).toBe(403)
    const unsupported = await get(
      `/v1/reports/analysis?${criteria}&sections=collections&productId=${randomUUID()}`,
    )
    expect(unsupported.statusCode).toBe(400)
    expect(unsupported.json().code).toBe('UNSUPPORTED_REPORT_FILTER')
  })
  it('captures comparisons consistently and resolves chart segments to supporting records', async () => {
    const comparison = await get(
      `/v1/reports/analysis?${criteria}&sections=revenue&comparePrevious=true`,
    )
    expect(comparison.statusCode, comparison.body).toBe(200)
    expect(comparison.json().comparison).toMatchObject({ from: '2026-08-02', to: '2026-08-31' })
    expect(comparison.json().comparison.sections[0].metrics).toContainEqual(
      expect.objectContaining({ key: 'gross', currency: 'MAD', value: '40.00' }),
    )
    const cohort = await get(
      `/v1/reports/analysis?${criteria}&sections=estimates&detailSection=estimates&segment=cohort:invoiced`,
    )
    expect(cohort.statusCode, cohort.body).toBe(200)
    expect(cohort.json().sections[0].total).toBe(1)
    expect(cohort.json().sections[0].rows[0]).toMatchObject({
      status: 'superseded',
      resource: 'estimates',
    })
    const cash = await get(
      `/v1/reports/analysis?${criteria}&sections=payment_methods&detailSection=payment_methods&segment=cash`,
    )
    expect(cash.statusCode, cash.body).toBe(200)
    expect(cash.json().sections[0].rows).toHaveLength(2)
    expect(
      cash
        .json()
        .sections[0].rows.every((row: { resource: string }) => row.resource === 'payments'),
    ).toBe(true)
    const invalid = await get(
      `/v1/reports/analysis?${criteria}&sections=outstanding&detailSection=outstanding&segment=unknown`,
    )
    expect(invalid.statusCode).toBe(400)
  })
  it('downloads complete CSV and PDF snapshots without scheduling or email side effects', async () => {
    for (const format of ['csv', 'pdf']) {
      const response = await post('/v1/reports/exports', {
        from: '2026-09-01',
        to: '2026-09-30',
        timezone: 'Africa/Casablanca',
        sections: ['summary', 'revenue', 'collections', 'sales_by_client'],
        format,
      })
      expect(response.statusCode, response.body).toBe(200)
      expect(response.headers['content-disposition']).toBe(
        `attachment; filename="report-2026-09-01-2026-09-30.${format}"`,
      )
      if (format === 'csv') {
        expect(response.body).toContain('120.00')
        expect(response.body).toContain("' =SUM(1,1)")
      } else expect(response.rawPayload.subarray(0, 5).toString()).toBe('%PDF-')
    }
    for (const table of [
      'report_schedules',
      'report_runs',
      'outbound_messages',
      'notification_dispatches',
    ]) {
      const [row] = await fixture.client.unsafe(`select count(*)::int as total from ${table}`)
      expect(row!.total).toBe(0)
    }
  })
  it('preserves run results after financial edits, bounds catch-up and denies deletion of historical schedules', async () => {
    let clock = new Date('2026-10-03T12:00:00Z')
    const identity = createIdentityModule({
      database: () => fixture.db,
      ttlDays: 1,
      secure: false,
    }).publicApi
    const reporting = createReportingModule({
      database: () => fixture.db,
      sales: createReportingReadRepository(() => fixture.db),
      identity,
      storage,
      clock: () => clock,
    })
    const response = await post('/v1/report-schedules', {
      name: 'Daily revenue',
      frequency: 'daily',
      weekday: null,
      monthDay: null,
      localTime: '09:00',
      timezone: 'UTC',
      period: 'previous_month',
      includedSections: ['summary', 'revenue'],
      recipientIds: [testUserId],
      enabled: true,
    })
    expect(response.statusCode, response.body).toBe(201)
    const schedule = response.json()
    expect(schedule.language).toBe('company')
    await fixture.client`update report_schedules set next_run_at='2026-10-01T09:00:00Z' where id=${schedule.id}`
    const repeatedEnable = await post(`/v1/report-schedules/${schedule.id}/enable`, {
      expectedVersion: schedule.version,
    })
    expect(repeatedEnable.statusCode, repeatedEnable.body).toBe(409)
    expect(
      new Date(
        (await fixture.client`select next_run_at from report_schedules where id=${schedule.id}`)[0]!
          .next_run_at,
      ).toISOString(),
    ).toBe('2026-10-01T09:00:00.000Z')
    const list = await get('/v1/report-schedules?status=all')
    expect(list.statusCode, list.body).toBe(200)
    expect(list.json().items).toHaveLength(1)
    await fixture.client`update report_schedules set next_run_at='2026-10-04T09:00:00Z' where id=${schedule.id}`
    clock = new Date('2026-10-12T12:00:00Z')
    await reporting.worker.sweep()
    const [count] =
      await fixture.client`select count(*)::int as total from report_runs where schedule_id=${schedule.id}`
    expect(count!.total).toBe(7)
    await reporting.worker.sweep()
    const [all] =
      await fixture.client`select count(*)::int as total from report_runs where schedule_id=${schedule.id}`
    expect(all!.total).toBe(9)
    await reporting.worker.sweep()
    expect(
      (
        await fixture.client`select count(*)::int as total from report_runs where schedule_id=${schedule.id}`
      )[0]!.total,
    ).toBe(9)
    expect(await reporting.worker.runOne()).toBe(true)
    const [run] = await fixture.client`select * from report_runs where status='succeeded' limit 1`
    expect(
      run,
      JSON.stringify(await fixture.client`select status,error_code from report_runs`),
    ).toBeTruthy()
    const snapshot = run!.data_snapshot
    await fixture.client`update payments set amount='40.00' where number='PAY-REPORT-1'`
    const saved = await get(`/v1/report-runs/${run!.id}`)
    expect(saved.statusCode, saved.body).toBe(200)
    expect(saved.json().dataSnapshot).toEqual(snapshot)
    expect(saved.json().artifacts).toHaveLength(1)
    expect(saved.json().deliveries).toEqual([
      expect.objectContaining({ status: 'skipped', reason: 'EMAIL_UNAVAILABLE' }),
    ])
    const disabled = await post(`/v1/report-schedules/${schedule.id}/disable`, {
      expectedVersion: schedule.version,
    })
    expect(disabled.statusCode, disabled.body).toBe(200)
    expect(
      (
        await fixture.client`select count(*)::int as total from report_runs where status='cancelled'`
      )[0]!.total,
    ).toBe(8)
    const blocked = await app.inject({
      method: 'DELETE',
      url: `/v1/report-schedules/${schedule.id}`,
      cookies,
      headers,
      payload: { expectedVersion: schedule.version },
    })
    expect(blocked.statusCode).toBe(409)
  }, 20000)
  it('enqueues frozen figures with the exact published PDF once and cancels unclaimed mail after recipient disable', async () => {
    const recipientId = randomUUID()
    const [role] =
      await fixture.client`insert into roles(key,name) values('report-recipient','Report recipient') returning id`
    await fixture.client`insert into users(id,email,password_hash,must_change_password) values(${recipientId},'recipient@example.test',${hash},false)`
    await fixture.client`insert into user_roles(user_id,role_id) values(${recipientId},${role!.id})`
    await fixture.client`insert into role_permissions(role_id,permission_id) select ${role!.id},id from permissions where key in ('reports.read','reports.export','report_runs.read','reports.sections.summary')`
    let clock = new Date('2026-10-03T12:00:00Z')
    const identity = createIdentityModule({
      database: () => fixture.db,
      ttlDays: 1,
      secure: false,
    }).publicApi
    const notifications = createNotificationSupport(
      () => fixture.db,
      storage,
      {
        supportsIdempotency: true,
        async send() {
          throw new Error('Provider must not be called')
        },
      },
      { allowedFrom: ['reports@example.test'], clock: () => clock },
    )
    const reporting = createReportingModule({
      database: () => fixture.db,
      sales: createReportingReadRepository(() => fixture.db),
      identity,
      storage,
      clock: () => clock,
      notifications,
      sender: { email: 'reports@example.test', name: 'Slama Finance' },
      uiOrigin: 'http://localhost:5173',
    })
    const response = await post('/v1/report-schedules', {
      name: 'Neutral report notice',
      language: 'en',
      frequency: 'daily',
      weekday: null,
      monthDay: null,
      localTime: '09:00',
      timezone: 'UTC',
      period: 'previous_month',
      includedSections: ['summary'],
      recipientIds: [recipientId],
      enabled: true,
    })
    expect(response.statusCode, response.body).toBe(201)
    await fixture.client`update report_schedules set next_run_at='2026-10-04T09:00:00Z' where id=${response.json().id}`
    clock = new Date('2026-10-04T12:00:00Z')
    await reporting.worker.sweep()
    // A pending run must retain the language captured at materialization.
    await fixture.client`update report_schedules set language='fr' where id=${response.json().id}`
    await reporting.worker.runOne()
    expect(await reporting.worker.runOne()).toBe(false)
    const [message] = await fixture.client`select * from outbound_messages`
    expect(
      message?.status,
      JSON.stringify(
        await fixture.client`select status,error_code,recipient_outcomes,next_attempt_at from report_runs`,
      ),
    ).toBe('queued')
    expect(message!.html).toContain('/reports/runs/')
    expect(message!.html).toContain('120.00')
    expect(message!.subject).toBe('Your scheduled financial report')
    expect(message!.html).toContain('<html lang="en">')
    expect(
      (await fixture.client`select count(*)::int as total from outbound_message_attachments`)[0]!
        .total,
    ).toBe(1)
    const [attachment] =
      await fixture.client`select a.object_key,a.byte_size,d.sha256 from outbound_message_attachments a join document_artifacts d on d.object_key=a.object_key where a.message_id=${message!.id}`
    expect(attachment).toBeDefined()
    const bytes = objects.get(attachment!.object_key)!
    expect(bytes.length).toBe(Number(attachment!.byte_size))
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(attachment!.sha256)
    const disabled = await post(`/v1/staff/${recipientId}/disable`, {})
    expect(disabled.statusCode, disabled.body).toBe(204)
    expect(
      (await fixture.client`select status from outbound_messages where id=${message!.id}`)[0]!
        .status,
    ).toBe('cancelled')
  }, 20000)
  async function cleanupFixture() {
    const created = await post('/v1/report-schedules', {
      name: 'Cleanup fixture',
      output: 'both',
      language: 'fr',
      frequency: 'daily',
      weekday: null,
      monthDay: null,
      localTime: '09:00',
      timezone: 'UTC',
      period: 'previous_month',
      includedSections: ['revenue'],
      recipientIds: [testUserId],
      enabled: true,
    })
    expect(created.statusCode, created.body).toBe(201)
    const schedule = created.json()
    await fixture.client`update report_schedules set next_run_at='2026-10-12T09:00:00Z' where id=${schedule.id}`
    const reporting = createReportingModule({
      database: () => fixture.db,
      sales: createReportingReadRepository(() => fixture.db),
      identity: createIdentityModule({ database: () => fixture.db, ttlDays: 1, secure: false })
        .publicApi,
      storage,
      clock: () => new Date('2026-10-12T12:00:00Z'),
    })
    await reporting.worker.sweep()
    const [run] = await fixture.client`select * from report_runs where schedule_id=${schedule.id}`
    return { schedule, run: run!, reporting }
  }
  it('keeps the PDF/CSV format set for legacy frozen configurations', async () => {
    const { run, reporting } = await cleanupFixture()
    await fixture.client`update report_runs set configuration_snapshot=configuration_snapshot-'output' where id=${run.id}`
    await reporting.worker.runOne()
    const before = (await get(`/v1/report-runs/${run.id}`)).json()
    expect(before.artifacts.map((file: { format: string }) => file.format).sort()).toEqual([
      'csv',
      'pdf',
    ])
    expect((await post(`/v1/report-runs/${run.id}/cleanup`, { mode: 'files' })).statusCode).toBe(
      200,
    )
    const restored = await post(`/v1/report-runs/${run.id}/regenerate-files`, {})
    expect(restored.statusCode, restored.body).toBe(200)
    expect(
      restored
        .json()
        .artifacts.map((file: { format: string }) => file.format)
        .sort(),
    ).toEqual(['csv', 'pdf'])
  })
  it('does not publish a partial set when a both-output snapshot exceeds PDF limits', async () => {
    const { run, reporting } = await cleanupFixture()
    const snapshot = (
      await get('/v1/reports/analysis?from=2026-09-01&to=2026-09-30&sections=revenue')
    ).json()
    snapshot.sections[0].total = 2001
    await fixture.client`update report_runs set data_snapshot=${JSON.stringify(snapshot)}::jsonb,data_captured_at=now() where id=${run.id}`
    await reporting.worker.runOne()
    expect(
      await fixture.client`select * from document_artifacts where document_id=${run.id}`,
    ).toHaveLength(0)
    expect(await fixture.client`select * from outbound_messages`).toHaveLength(0)
    const [failed] = await fixture.client`select error_code from report_runs where id=${run.id}`
    expect(failed!.error_code).toBe('EXPORT_TOO_LARGE')
  })
  it('cleans files, restores frozen figures without email, filters storage totals and permanently deletes a run', async () => {
    const { schedule, run, reporting } = await cleanupFixture()
    expect((await post(`/v1/report-runs/${run.id}/cleanup`, { mode: 'run' })).statusCode).toBe(409)
    await reporting.worker.runOne()
    const before = (await get(`/v1/report-runs/${run.id}`)).json()
    expect(before.status).toBe('succeeded')
    const bytes = before.artifacts.reduce(
      (sum: number, file: { byteSize: number }) => sum + file.byteSize,
      0,
    )
    const list = await get(
      `/v1/report-schedules/${schedule.id}/runs?search=Cleanup&status=succeeded&trigger=scheduled&from=2026-09-01&to=2026-09-30`,
    )
    expect(list.json()).toMatchObject({ total: 1, storageBytes: bytes })
    expect(
      (await get(`/v1/report-schedules/${schedule.id}/runs?search=missing`)).json(),
    ).toMatchObject({ total: 0, storageBytes: 0 })
    expect(
      (await get(`/v1/report-schedules/${schedule.id}/runs?from=2026-10-01&to=2026-09-01`))
        .statusCode,
    ).toBe(400)
    const cleaned = await post(`/v1/report-runs/${run.id}/cleanup`, { mode: 'files' })
    expect(cleaned.json()).toEqual({
      removedFiles: 2,
      freedBytes: bytes,
      retainedFiles: 0,
      pendingFiles: 0,
    })
    expect(objects.size).toBe(0)
    expect((await get(`/v1/report-runs/${run.id}`)).json()).toMatchObject({
      dataSnapshot: before.dataSnapshot,
      artifacts: [],
    })
    await fixture.client`update invoices set total='999.00',subtotal='979.00' where id=${invoiceId}`
    const restored = await post(`/v1/report-runs/${run.id}/regenerate-files`, {})
    expect(restored.statusCode, restored.body).toBe(200)
    expect(restored.json().dataSnapshot).toEqual(before.dataSnapshot)
    expect(restored.json().artifacts).toHaveLength(2)
    const [excel] =
      await fixture.client`select object_key from document_artifacts where document_id=${run.id} and format='xlsx'`
    expect(objects.get(excel!.object_key)).toBeTruthy()
    expect(await fixture.client`select * from outbound_messages`).toHaveLength(0)
    expect((await post(`/v1/report-runs/${run.id}/cleanup`, { mode: 'run' })).statusCode).toBe(200)
    expect((await get(`/v1/report-runs/${run.id}`)).statusCode).toBe(404)
    expect((await get(`/v1/report-schedules/${schedule.id}`)).statusCode).toBe(200)
    expect(await fixture.client`select * from invoices where id=${invoiceId}`).toHaveLength(1)
    expect(
      await fixture.client`select * from audit_events where entity_table='report_runs' and action in ('delete_files','regenerate_files','delete')`,
    ).toHaveLength(3)
  })
  it('protects queued email, releases terminal attachments, prevents retries, and cascades schedule deletion', async () => {
    const { schedule, run, reporting } = await cleanupFixture()
    await reporting.worker.runOne()
    const [pdf] =
      await fixture.client`select * from document_artifacts where document_id=${run.id} and format='pdf'`
    const messageId = randomUUID(),
      dispatchId = randomUUID()
    await fixture.client`insert into outbound_messages(id,to_address,from_email,from_name,subject,html,text_body,idempotency_key,payload_hash) values(${messageId},'operator@example.test','reports@example.test','Slama','Report','Report','Report',${randomUUID()},${'a'.repeat(64)})`
    await fixture.client`insert into outbound_message_attachments(message_id,object_key,filename,content_type,byte_size,position) values(${messageId},${pdf!.object_key},'report.pdf','application/pdf',${pdf!.byte_size},0)`
    await fixture.client`insert into notification_dispatches(id,source_type,source_id,event_key,occurrence_key,logical_occurrence_key,message_id) values(${dispatchId},'report_run',${run.id},'report_available',${testUserId},${testUserId},${messageId})`
    const removeSchedule = () =>
      app.inject({
        method: 'DELETE',
        url: `/v1/report-schedules/${schedule.id}`,
        headers,
        cookies,
        payload: { expectedVersion: schedule.version },
      })
    expect((await removeSchedule()).statusCode).toBe(409)
    expect((await post(`/v1/report-runs/${run.id}/cleanup`, { mode: 'files' })).statusCode).toBe(
      409,
    )
    expect(objects.size).toBe(2)
    await fixture.client`update outbound_messages set status='failed' where id=${messageId}`
    expect((await post(`/v1/report-runs/${run.id}/cleanup`, { mode: 'files' })).statusCode).toBe(
      200,
    )
    await expect(
      fixture.db.transaction((tx) =>
        reporting.reportOwner.assertRetryable(tx, run.id, testUserId, messageId),
      ),
    ).rejects.toMatchObject({ code: 'REPORT_FILES_REMOVED' })
    await post(`/v1/report-runs/${run.id}/regenerate-files`, {})
    const deleted = await removeSchedule()
    expect(deleted.statusCode, deleted.body).toBe(204)
    expect(objects.size).toBe(0)
    for (const table of [
      'report_schedules',
      'report_schedule_recipients',
      'report_runs',
      'document_artifacts',
      'notification_dispatches',
      'outbound_messages',
      'outbound_message_attachments',
    ])
      expect(await fixture.client.unsafe(`select * from ${table}`), table).toHaveLength(0)
  })
  it('retains externally referenced files and reports storage failures for maintenance', async () => {
    const { run, reporting } = await cleanupFixture()
    await reporting.worker.runOne()
    const [pdf] =
      await fixture.client`select * from document_artifacts where document_id=${run.id} and format='pdf'`
    const messageId = randomUUID()
    await fixture.client`insert into outbound_messages(id,to_address,from_email,from_name,subject,html,text_body,idempotency_key,payload_hash) values(${messageId},'other@example.test','reports@example.test','Slama','Other','Other','Other',${randomUUID()},${'b'.repeat(64)})`
    await fixture.client`insert into outbound_message_attachments(message_id,object_key,filename,content_type,byte_size,position) values(${messageId},${pdf!.object_key},'shared.pdf','application/pdf',${pdf!.byte_size},0)`
    failDeletion = true
    const result = await post(`/v1/report-runs/${run.id}/cleanup`, { mode: 'files' })
    expect(result.json()).toEqual({
      removedFiles: 0,
      freedBytes: 0,
      retainedFiles: 1,
      pendingFiles: 1,
    })
    expect(objects.size).toBe(2)
  })
  it('rejects oversized PDF details but captures all rows for an Excel-only schedule', async () => {
    await fixture.client`insert into invoices(number,status,client_id,issue_date,due_date,currency,issuer_snapshot,client_snapshot,appearance_snapshot,subtotal,tax_total,total,issued_at) select 'INV-SYNTH-'||n,'issued',${clientId},'2026-09-10','2026-10-30','MAD','{}','{}','{}','1.00','0.00','1.00',now() from generate_series(1,2500) n`
    const result = await get(`/v1/reports/analysis?${criteria}&sections=revenue&limit=25`)
    expect(result.statusCode, result.body).toBe(200)
    expect(result.json().sections[0]).toMatchObject({ total: 2502, rows: expect.any(Array) })
    expect(result.json().sections[0].rows).toHaveLength(25)
    expect(result.json().sections[0].metrics).toContainEqual(
      expect.objectContaining({ key: 'gross', currency: 'MAD', value: '2620.00' }),
    )
    const [plan] =
      await fixture.client`explain(analyze,buffers,format json) select currency,sum(total) from invoices where status in ('issued','sent') and issue_date >= '2026-09-01' and issue_date <= '2026-09-30' group by currency`
    expect(plan!['QUERY PLAN'][0].Plan['Actual Rows']).toBe(2)
    const denied = await post('/v1/reports/exports', {
      from: '2026-09-01',
      to: '2026-09-30',
      sections: ['revenue'],
      format: 'pdf',
    })
    expect(denied.statusCode).toBe(400)
    expect(denied.json().code).toBe('EXPORT_TOO_LARGE')
    const scheduleResponse = await post('/v1/report-schedules', {
      name: 'Complete CSV capture',
      output: 'excel',
      frequency: 'daily',
      weekday: null,
      monthDay: null,
      localTime: '09:00',
      timezone: 'UTC',
      period: 'previous_month',
      includedSections: ['revenue'],
      recipientIds: [testUserId],
      enabled: true,
    })
    expect(scheduleResponse.statusCode, scheduleResponse.body).toBe(201)
    const scheduleId = scheduleResponse.json().id
    await fixture.client`update report_schedules set next_run_at='2026-10-12T09:00:00Z' where id=${scheduleId}`
    const reporting = createReportingModule({
      database: () => fixture.db,
      sales: createReportingReadRepository(() => fixture.db),
      identity: createIdentityModule({ database: () => fixture.db, ttlDays: 1, secure: false })
        .publicApi,
      storage,
      clock: () => new Date('2026-10-12T12:00:00Z'),
    })
    await reporting.worker.sweep()
    expect(await reporting.worker.runOne()).toBe(true)
    const [run] = await fixture.client`select * from report_runs where schedule_id=${scheduleId}`
    expect(run!.status, run!.error_code).toBe('succeeded')
    const captured = ReportAnalysisSchema.parse(run!.data_snapshot)
    expect(captured.sections[0]!.rows).toHaveLength(2502)
    expect(captured.sections[0]!.total).toBe(2502)
    const files =
      await fixture.client`select object_key,format from document_artifacts where document_id=${run!.id}`
    expect(files).toHaveLength(1)
    expect(files[0]!.format).toBe('xlsx')
    expect(Buffer.from(objects.get(files[0]!.object_key)!).subarray(0, 2).toString()).toBe('PK')
  })
})
