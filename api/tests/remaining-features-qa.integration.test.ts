import { createHash, randomUUID } from 'node:crypto'

import ExcelJS from 'exceljs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/env.js'
import { ReportAnalysisSchema } from '../src/contracts/generated/reporting/reporting.schemas.js'
import {
  ReportSchedulePreviewInputSchema,
  ReportSchedulePreviewSchema,
} from '../src/contracts/generated/reporting/schedule-preview.schemas.js'
import type { ObjectStorage } from '../src/integrations/contracts.js'
import {
  createRecordingEmailProvider,
  EmailTransportError,
} from '../src/integrations/email/transport.js'
import { companyDate } from '../src/lib/validation.js'
import type { WorkerEvent, WorkerObserver } from '../src/lib/worker-observer.js'
import { createClientNotificationModule } from '../src/modules/clients/index.js'
import { createPasswordService } from '../src/modules/identity/auth/services/password.service.js'
import { createIdentityModule } from '../src/modules/identity/index.js'
import { createMediaModule } from '../src/modules/media/index.js'
import { createReportingModule } from '../src/modules/reporting/index.js'
import { createSalesModule, createSalesNotificationsModule } from '../src/modules/sales/index.js'
import { createNotificationSettingsModule } from '../src/modules/settings/index.js'
import { createJobSupport } from '../src/support/jobs/index.js'
import { createNotificationSupport } from '../src/support/notifications/index.js'
import { isolatedDatabase, testUserId } from './helpers/postgres.js'

const headers = { origin: 'http://localhost:5173' }
const password = 'independent-qa-password-123'
const reportGrants = ['reports.read']

describe('Independent remaining-feature regression QA', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let app: Awaited<ReturnType<typeof buildApp>>
  let cookies: { slama_session: string }
  let hash: string
  let clientId: string
  let clock: Date
  let rejectEmail: boolean
  let failExcelUpload: boolean
  let beforeUpload: ((key: string) => Promise<void>) | undefined
  const files = new Map<string, Uint8Array>()
  const provider = createRecordingEmailProvider()
  const storage: ObjectStorage = {
    async putImmutable({ key, bytes, contentType }) {
      await beforeUpload?.(key)
      if (failExcelUpload && key.endsWith('.xlsx')) throw new Error('Injected Excel upload failure')
      files.set(key, bytes)
      return {
        key,
        byteSize: bytes.byteLength,
        contentType,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      }
    },
    async get(key) {
      const bytes = files.get(key)
      if (!bytes) throw new Error('Missing QA object')
      return bytes
    },
    async deleteUnreferenced(key) {
      files.delete(key)
    },
    async signedDownloadUrl() {
      throw new Error('QA does not issue signed URLs')
    },
    async list() {
      return []
    },
  }
  const request = (
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    payload?: object,
    session = cookies,
  ) => app.inject({ method, url, headers, cookies: session, ...(payload ? { payload } : {}) })

  async function login(email: string) {
    const response = await request('POST', '/v1/auth/login', { email, password })
    expect(response.statusCode, response.body).toBe(200)
    return { slama_session: response.cookies[0]!.value }
  }
  beforeEach(async () => {
    files.clear()
    provider.messages.length = 0
    clock = new Date('2026-10-04T12:00:00Z')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(clock)
    rejectEmail = false
    failExcelUpload = false
    beforeUpload = undefined
    fixture = await isolatedDatabase()
    // PostgreSQL defaults do not follow Vitest's Date clock. Keep only this
    // disposable schema's queue defaults aligned with the deterministic workers.
    await fixture.client`alter table background_jobs alter column available_at set default '2026-10-04T12:00:00Z'::timestamptz`
    await fixture.client`alter table outbound_messages alter column available_at set default '2026-10-04T12:00:00Z'::timestamptz`
    hash = await createPasswordService().hash(password)
    await fixture.client`update users set password_hash=${hash} where id=${testUserId}`
    await fixture.client`insert into user_roles(user_id,role_id) select ${testUserId},id from roles where key='admin'`
    await fixture.client`update company_settings set legal_name='Slama',address_line1='Atlas',city='Casablanca' where id=1`
    const [client] =
      await fixture.client`insert into clients(type,legal_name,address_line1,city,email) values('company','QA Client','Atlas','Casablanca','qa-client@example.test') returning id`
    clientId = client!.id as string
    app = await buildApp({
      environment: loadEnvironment({ NODE_ENV: 'test' }),
      logger: false,
      mediaStorage: storage,
    })
    app.database = () => fixture.db
    cookies = await login('operator@example.test')
  })
  afterEach(async () => {
    await app?.close()
    await fixture?.cleanup()
    files.clear()
    vi.useRealTimers()
  })

  function transport(observe?: WorkerObserver) {
    return createNotificationSupport(
      () => fixture.db,
      storage,
      {
        supportsIdempotency: true,
        async send(input) {
          if (rejectEmail) throw new EmailTransportError('PROVIDER_REJECTED', true)
          return provider.send(input)
        },
      },
      { allowedFrom: ['notifications@example.invalid'], clock: () => clock, observe },
    )
  }
  function salesWorkers() {
    const notifications = transport()
    const policies = createNotificationSettingsModule(() => fixture.db, notifications, {
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
      notifications,
      policies.publicApi,
      clients.publicApi,
      sales.prepareNotificationAttachment,
      { clock: () => clock },
    )
    return { producer, notifications }
  }
  function reportWorkers(observe?: WorkerObserver) {
    const notifications = transport(observe)
    const reporting = createReportingModule({
      database: () => fixture.db,
      sales: createSalesModule(
        () => fixture.db,
        storage,
        createMediaModule(() => fixture.db, storage).publicApi,
      ).publicApi.reporting,
      identity: createIdentityModule({
        database: () => fixture.db,
        ttlDays: 1,
        secure: false,
      }).publicApi,
      storage,
      notifications,
      sender: { email: 'notifications@example.invalid', name: 'QA' },
      uiOrigin: headers.origin,
      clock: () => clock,
      observe,
    })
    return { reporting, notifications }
  }
  async function enableInvoiceRule() {
    const list = await request('GET', '/v1/notification-rules')
    expect(list.statusCode, list.body).toBe(200)
    const rule = list
      .json()
      .items.find((item: { eventKey: string }) => item.eventKey === 'invoice_sent')
    const response = await request('PATCH', `/v1/notification-rules/${rule.id}`, {
      expectedVersion: rule.version,
      enabled: true,
      offsetDays: 0,
      repeatEveryDays: null,
      senderName: rule.senderName,
      senderEmail: rule.senderEmail,
      locale: rule.locale,
      subjectTemplate: rule.subjectTemplate,
      bodyTemplate: rule.bodyTemplate,
    })
    expect(response.statusCode, response.body).toBe(200)
    return response.json().id as string
  }
  async function invoice() {
    const date = companyDate(new Date())
    const draft = await request('POST', '/v1/invoices', {
      clientId,
      templateId: null,
      issueDate: date,
      dueDate: date,
      notes: null,
      paymentTerms: null,
      lines: [
        {
          productVariantId: null,
          productName: 'QA grain',
          quantity: 1,
          unitPrice: '100.00',
          vatRate: null,
        },
      ],
    })
    expect(draft.statusCode, draft.body).toBe(201)
    const issued = await request('POST', `/v1/invoices/${draft.json().id}/issue`, {
      expectedVersion: 1,
    })
    expect(issued.statusCode, issued.body).toBe(200)
    return issued.json()
  }
  async function setCc(ruleId: string, cc: string[], expectedVersion = 0) {
    const response = await request(
      'PUT',
      `/v1/clients/${clientId}/notification-preferences/${ruleId}`,
      {
        expectedVersion,
        enabled: true,
        cc,
      },
    )
    expect(response.statusCode, response.body).toBe(200)
    return response.json().version as number
  }

  it.each([
    ['preparation', 'remove'],
    ['preparation', 'reset'],
    ['queued', 'remove'],
    ['queued', 'reset'],
    ['retry', 'remove'],
    ['retry', 'reset'],
  ] as const)('honors CC %s eligibility after preference %s', async (stage, change) => {
    const ruleId = await enableInvoiceRule()
    const version = await setCc(ruleId, ['former-recipient@example.test'])
    const doc = await invoice()
    const accepted = await request('POST', `/v1/invoices/${doc.id}/send`, {
      expectedVersion: doc.version,
      requestId: randomUUID(),
    })
    expect(accepted.statusCode, accepted.body).toBe(202)
    const workers = salesWorkers()
    let dispatchId: string | undefined
    let messageId: string | undefined
    if (stage !== 'preparation') {
      expect(await workers.producer.worker.runOne()).toBe(true)
      const [dispatch] =
        await fixture.client`select id,message_id from notification_dispatches where source_id=${doc.id}`
      expect(dispatch).toBeTruthy()
      dispatchId = dispatch!.id as string
      messageId = dispatch!.message_id as string
      if (stage === 'retry') {
        rejectEmail = true
        expect(await workers.notifications.worker.runOne()).toBe(true)
        expect(await workers.notifications.status(messageId)).toMatchObject({ status: 'failed' })
      }
    }
    if (change === 'remove') await setCc(ruleId, [], version)
    else {
      const reset = await request(
        'DELETE',
        `/v1/clients/${clientId}/notification-preferences/${ruleId}`,
        { expectedVersion: version },
      )
      expect(reset.statusCode, reset.body).toBe(204)
    }
    if (stage === 'preparation') {
      const [job] =
        await fixture.client`select status from background_jobs where id=${accepted.json().jobId}`
      expect(job!.status).toBe('cancelled')
      expect(await workers.producer.worker.runOne()).toBe(false)
      expect(
        await fixture.client`select id from notification_dispatches where source_id=${doc.id}`,
      ).toHaveLength(0)
    } else if (stage === 'queued') {
      expect(await workers.notifications.status(messageId!)).toMatchObject({ status: 'cancelled' })
      expect(await workers.notifications.worker.runOne()).toBe(false)
    } else {
      const retry = await request(
        'POST',
        `/v1/documents/invoice/${doc.id}/notifications/${dispatchId}/retry`,
        {},
      )
      expect(retry.statusCode, retry.body).toBe(409)
      expect(await workers.notifications.status(messageId!)).toMatchObject({
        status: 'failed',
        attempts: 1,
      })
    }
    expect(provider.messages).toHaveLength(0)
  })

  async function staff(grants = reportGrants) {
    const id = randomUUID()
    const email = `${id}@example.test`
    const [role] =
      await fixture.client`insert into roles(key,name) values(${`qa-${id}`},'QA custom role') returning id`
    await fixture.client`insert into users(id,email,password_hash,must_change_password) values(${id},${email},${hash},false)`
    await fixture.client`insert into user_roles(user_id,role_id) values(${id},${role!.id})`
    await fixture.client`insert into role_permissions(role_id,permission_id) select ${role!.id},id from permissions where key=any(${grants})`
    return { id, roleId: role!.id as string, cookies: await login(email) }
  }

  it.each([
    ['preparation', 'permissions'],
    ['preparation', 'roles'],
    ['queued', 'permissions'],
    ['queued', 'roles'],
  ] as const)(
    'HTTP send-authority revocation cancels %s work after changing %s',
    async (stage, mode) => {
      await enableInvoiceRule()
      const senderGrants = ['invoices.read', 'invoices.update']
      const sender = await staff(senderGrants)
      const doc = await invoice()
      const accepted = await request(
        'POST',
        `/v1/invoices/${doc.id}/send`,
        {
          expectedVersion: doc.version,
          requestId: randomUUID(),
        },
        sender.cookies,
      )
      expect(accepted.statusCode, accepted.body).toBe(202)
      const workers = salesWorkers()
      if (stage === 'queued') expect(await workers.producer.worker.runOne()).toBe(true)
      const revoke =
        mode === 'permissions'
          ? await request('PUT', `/v1/rbac/roles/${sender.roleId}/permissions`, {
              permissionKeys: ['invoices.read'],
            })
          : await request('PUT', `/v1/staff/${sender.id}/roles`, { roleIds: [] })
      expect(revoke.statusCode, revoke.body).toBe(204)
      if (stage === 'preparation') {
        const [job] =
          await fixture.client`select status from background_jobs where id=${accepted.json().jobId}`
        expect(job!.status).toBe('cancelled')
        expect(await workers.producer.worker.runOne()).toBe(false)
      } else {
        const [dispatch] =
          await fixture.client`select message_id from notification_dispatches where source_id=${doc.id}`
        expect(await workers.notifications.status(dispatch!.message_id)).toMatchObject({
          status: 'cancelled',
        })
      }
      expect(await workers.notifications.worker.runOne()).toBe(false)
      expect(provider.messages).toHaveLength(0)
    },
  )
  async function schedule(recipientId: string, session = cookies) {
    const response = await request(
      'POST',
      '/v1/report-schedules',
      {
        name: 'Independent QA schedule',
        frequency: 'daily',
        weekday: null,
        monthDay: null,
        localTime: '09:00',
        timezone: 'UTC',
        period: 'previous_month',
        includedSections: ['summary'],
        output: 'both',
        recipientIds: [recipientId],
        enabled: true,
      },
      session,
    )
    expect(response.statusCode, response.body).toBe(201)
    const id = response.json().id as string
    await fixture.client`update report_schedules set next_run_at='2026-10-04T09:00:00Z' where id=${id}`
    return id
  }
  async function materialize(
    scheduleId: string,
    reporting: ReturnType<typeof reportWorkers>['reporting'],
  ) {
    expect(await reporting.worker.sweep()).toBe(1)
    await fixture.client`update report_runs set next_attempt_at=${clock.toISOString()} where schedule_id=${scheduleId}`
    const [run] = await fixture.client`select id from report_runs where schedule_id=${scheduleId}`
    return run!.id as string
  }

  it('uses the single reporting grant for schedule creation and activation', async () => {
    const author = await staff(reportGrants)
    const outsider = await staff([])
    const input = {
      name: 'Draft schedule without enable authority',
      frequency: 'daily',
      weekday: null,
      monthDay: null,
      localTime: '09:00',
      timezone: 'UTC',
      period: 'previous_month',
      includedSections: ['summary'],
      recipientIds: [testUserId],
      enabled: true,
    }
    const denied = await request('POST', '/v1/report-schedules', input, outsider.cookies)
    expect(denied.statusCode, denied.body).toBe(403)
    expect(await fixture.client`select id from report_schedules`).toHaveLength(0)
    const draft = await request(
      'POST',
      '/v1/report-schedules',
      { ...input, enabled: false },
      author.cookies,
    )
    expect(draft.statusCode, draft.body).toBe(201)
    expect(draft.json()).toMatchObject({ enabled: false, nextRunAt: null })
    const activation = await request(
      'POST',
      `/v1/report-schedules/${draft.json().id}/enable`,
      { expectedVersion: draft.json().version },
      author.cookies,
    )
    expect(activation.statusCode, activation.body).toBe(200)
    expect(activation.json().enabled).toBe(true)
    const enabled = await request('POST', '/v1/report-schedules', input, author.cookies)
    expect(enabled.statusCode, enabled.body).toBe(201)
  })

  it('previews authorized cadence and inclusive local periods without persisting work', async () => {
    const previewer = await staff(['reports.read'])
    const base = {
      frequency: 'daily',
      weekday: null,
      monthDay: null,
      localTime: '00:30',
      timezone: 'Pacific/Kiritimati',
      period: 'previous_day',
    }
    const iso = (date: Date) => date.toISOString().slice(0, 10)
    for (const configuration of [
      base,
      { ...base, frequency: 'weekly', weekday: 1, period: 'previous_week' },
      { ...base, frequency: 'monthly', monthDay: 28, period: 'previous_month' },
    ]) {
      const input = ReportSchedulePreviewInputSchema.parse(configuration)
      const before = Date.now()
      const response = await request(
        'POST',
        '/v1/report-schedules/preview',
        input,
        previewer.cookies,
      )
      expect(response.statusCode, response.body).toBe(200)
      const preview = ReportSchedulePreviewSchema.parse(response.json())
      expect(preview.timezone).toBe(input.timezone)
      const next = new Date(preview.nextRunAt)
      expect(next.getTime()).toBeGreaterThan(before)
      const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', {
          timeZone: preview.timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        })
          .formatToParts(next)
          .map((part) => [part.type, part.value]),
      )
      expect(`${parts.hour}:${parts.minute}`).toBe('00:30')
      const localDate = `${parts.year}-${parts.month}-${parts.day}`
      expect(localDate).not.toBe(iso(next))
      const localDay = new Date(`${localDate}T12:00:00Z`)
      if (input.frequency === 'daily') {
        const previous = new Date(localDay.getTime() - 86400000)
        expect(preview).toMatchObject({ periodStart: iso(previous), periodEnd: iso(previous) })
      } else if (input.frequency === 'weekly') {
        expect(localDay.getUTCDay()).toBe(1)
        expect(preview).toMatchObject({
          periodStart: iso(new Date(localDay.getTime() - 7 * 86400000)),
          periodEnd: iso(new Date(localDay.getTime() - 86400000)),
        })
      } else {
        expect(localDay.getUTCDate()).toBe(28)
        expect(preview).toMatchObject({
          periodStart: iso(
            new Date(Date.UTC(localDay.getUTCFullYear(), localDay.getUTCMonth() - 1, 1)),
          ),
          periodEnd: iso(new Date(Date.UTC(localDay.getUTCFullYear(), localDay.getUTCMonth(), 0))),
        })
      }
    }
    for (const input of [
      { ...base, frequency: 'weekly' },
      { ...base, frequency: 'weekly', weekday: 1, monthDay: 1 },
      { ...base, frequency: 'monthly' },
      { ...base, frequency: 'monthly', weekday: 1, monthDay: 1 },
    ]) {
      const denied = await request('POST', '/v1/report-schedules/preview', input, previewer.cookies)
      expect(denied.statusCode, denied.body).toBe(400)
      expect(denied.json().code).toBe('INVALID_REPORT_CADENCE')
    }
    const timezone = await request(
      'POST',
      '/v1/report-schedules/preview',
      { ...base, timezone: 'Invalid/QA' },
      previewer.cookies,
    )
    expect(timezone.statusCode, timezone.body).toBe(400)
    expect(timezone.json().code).toBe('INVALID_TIMEZONE')
    for (const grants of [[], ['report_schedules.read']]) {
      const limited = await staff(grants)
      const denied = await request('POST', '/v1/report-schedules/preview', base, limited.cookies)
      expect(denied.statusCode, denied.body).toBe(403)
    }
    for (const table of [
      'report_schedules',
      'report_runs',
      'background_jobs',
      'document_artifacts',
      'outbound_messages',
      'notification_dispatches',
    ]) {
      const [row] = await fixture.client.unsafe(`select count(*)::int as total from ${table}`)
      expect(row!.total, table).toBe(0)
    }
    expect(files.size).toBe(0)
  })

  it('isolates throwing worker observers and emits operational metadata without email payloads', async () => {
    const events: WorkerEvent[] = []
    const { reporting, notifications } = reportWorkers((event) => {
      events.push(event)
      throw new Error('Injected telemetry failure')
    })
    const id = await schedule(testUserId)
    const runId = await materialize(id, reporting)
    expect(await reporting.worker.runOne()).toBe(true)
    const [run] = await fixture.client`select status from report_runs where id=${runId}`
    expect(run!.status).toBe('succeeded')
    expect(await notifications.worker.runOne()).toBe(true)
    expect(provider.messages).toHaveLength(1)
    const [message] = await fixture.client`select id,status from outbound_messages`
    expect(message!.status).toBe('sent')
    expect(events).toEqual([
      expect.objectContaining({ worker: 'report', event: 'captured', id: runId, attempt: 1 }),
      expect.objectContaining({
        worker: 'report',
        event: 'published',
        id: runId,
        attempt: 1,
        artifactBytes: expect.any(Number),
      }),
      expect.objectContaining({
        worker: 'notification',
        event: 'accepted',
        id: message!.id,
        attempt: 1,
        responseClass: '2xx',
      }),
    ])
    const keys = [
      'worker',
      'event',
      'id',
      'attempt',
      'durationMs',
      'artifactBytes',
      'errorCode',
      'responseClass',
    ]
    for (const event of events)
      expect(Object.keys(event).every((key) => keys.includes(key))).toBe(true)
    const serialized = JSON.stringify(events)
    expect(serialized).not.toContain('@')
    expect(serialized).not.toContain('Your scheduled report')
    expect(serialized).not.toContain('/reports/runs/')
  })

  it('reports empty queues and only eligible work age through real metric SQL', async () => {
    const notifications = transport()
    const jobs = createJobSupport(() => fixture.db)
    const { reporting } = reportWorkers()
    expect(await notifications.metrics()).toEqual({
      queued: 0,
      sending: 0,
      retried: 0,
      failed: 0,
      oldestEligibleAgeSeconds: 0,
    })
    expect(await jobs.metrics(clock)).toHaveLength(0)
    expect(await reporting.metrics()).toEqual({
      queued: 0,
      running: 0,
      retried: 0,
      failed: 0,
      oldestEligibleAgeSeconds: 0,
      scheduleLagSeconds: 0,
    })
    for (const offset of [-3600, 3600]) {
      const message = await notifications.enqueue({
        idempotencyKey: `qa:metrics:${offset}`,
        actor: testUserId,
        from: { email: 'notifications@example.invalid', name: 'QA' },
        to: 'qa@example.test',
        cc: [],
        subject: 'Safe fixture',
        html: '<p>Fixture</p>',
        text: 'Fixture',
        attachments: [],
      })
      await fixture.client`update outbound_messages set available_at=${new Date(clock.getTime() + offset * 1000).toISOString()} where id=${message.id}`
    }
    expect(await notifications.metrics()).toMatchObject({
      queued: 2,
      sending: 0,
      oldestEligibleAgeSeconds: 3600,
    })
    const job = await jobs.enqueuePdf(
      { documentType: 'invoice', documentId: randomUUID(), sourceVersion: 1 },
      testUserId,
    )
    await fixture.client`update background_jobs set available_at=${new Date(clock.getTime() - 120000).toISOString()} where id=${job.id}`
    expect(await jobs.metrics(clock)).toEqual([
      {
        jobType: 'prepare_pdf',
        queued: 1,
        running: 0,
        retried: 0,
        failed: 0,
        oldestEligibleAgeSeconds: 120,
      },
    ])
    const id = await schedule(testUserId)
    expect(await reporting.metrics()).toMatchObject({
      queued: 0,
      oldestEligibleAgeSeconds: 0,
      scheduleLagSeconds: 10800,
    })
    const runId = await materialize(id, reporting)
    await fixture.client`update report_runs set next_attempt_at=${new Date(clock.getTime() - 60000).toISOString()} where id=${runId}`
    expect(await reporting.metrics()).toMatchObject({
      queued: 1,
      oldestEligibleAgeSeconds: 60,
      scheduleLagSeconds: 0,
    })
  })
  async function revoke(target: Awaited<ReturnType<typeof staff>>, mode: 'permissions' | 'roles') {
    const response =
      mode === 'permissions'
        ? await request('PUT', `/v1/rbac/roles/${target.roleId}/permissions`, {
            permissionKeys: [],
          })
        : await request('PUT', `/v1/staff/${target.id}/roles`, { roleIds: [] })
    expect(response.statusCode, response.body).toBe(204)
  }

  it.each(['permissions', 'roles'] as const)(
    'HTTP %s revocation disables owner schedules and cancels unstarted runs and queued notices',
    async (mode) => {
      const owner = await staff()
      const id = await schedule(testUserId, owner.cookies)
      const { reporting, notifications } = reportWorkers()
      const historicalId = await materialize(id, reporting)
      expect(await reporting.worker.runOne()).toBe(true)
      const [message] = await fixture.client`select id,status from outbound_messages`
      expect(message!.status).toBe('queued')
      clock = new Date('2026-10-05T12:00:00Z')
      expect(await reporting.worker.sweep()).toBe(1)
      await revoke(owner, mode)
      const [row] =
        await fixture.client`select enabled,next_run_at from report_schedules where id=${id}`
      expect(row).toMatchObject({ enabled: false, next_run_at: null })
      expect(await notifications.status(message!.id)).toMatchObject({ status: 'cancelled' })
      expect(await notifications.worker.runOne()).toBe(false)
      const runs = await fixture.client`select id,status from report_runs where schedule_id=${id}`
      expect(runs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: historicalId, status: 'succeeded' }),
          expect.objectContaining({ status: 'cancelled' }),
        ]),
      )
      expect(provider.messages).toHaveLength(0)
    },
    20000,
  )

  it.each(['permissions', 'roles'] as const)(
    'HTTP recipient %s revocation cancels queued notices and forbids historical download',
    async (mode) => {
      const recipient = await staff()
      const id = await schedule(recipient.id)
      const { reporting, notifications } = reportWorkers()
      const runId = await materialize(id, reporting)
      expect(await reporting.worker.runOne()).toBe(true)
      const view = await request('GET', `/v1/report-runs/${runId}`, undefined, recipient.cookies)
      expect(view.statusCode, view.body).toBe(200)
      const artifactId = view.json().artifacts[0].id as string
      const before = await request(
        'GET',
        `/v1/artifacts/${artifactId}/download`,
        undefined,
        recipient.cookies,
      )
      expect(before.statusCode, before.body).toBe(200)
      const excelId = view
        .json()
        .artifacts.find((item: { format: string }) => item.format === 'xlsx').id as string
      const excelDownload = await request(
        'GET',
        `/v1/artifacts/${excelId}/download`,
        undefined,
        recipient.cookies,
      )
      expect(excelDownload.statusCode, excelDownload.body).toBe(200)
      expect(excelDownload.headers['content-type']).toContain('spreadsheetml.sheet')
      expect(excelDownload.headers['content-disposition']).toBe(
        `attachment; filename="report_run-${excelId}.xlsx"`,
      )
      await revoke(recipient, mode)
      const denied = await request(
        'GET',
        `/v1/artifacts/${artifactId}/download`,
        undefined,
        recipient.cookies,
      )
      expect(denied.statusCode, denied.body).toBe(403)
      expect(
        (await request('GET', `/v1/report-runs/${runId}`, undefined, recipient.cookies)).statusCode,
      ).toBe(403)
      const [message] = await fixture.client`select id from outbound_messages`
      expect(await notifications.status(message!.id)).toMatchObject({ status: 'cancelled' })
      expect(await notifications.worker.runOne()).toBe(false)
      const [preserved] = await fixture.client`select status from report_runs where id=${runId}`
      expect(preserved!.status).toBe('succeeded')
      expect(provider.messages).toHaveLength(0)
    },
    20000,
  )

  it('retries partial artifact production from its frozen capture and preserves the published PDF', async () => {
    await fixture.client`insert into invoices(number,status,client_id,issue_date,due_date,currency,issuer_snapshot,client_snapshot,appearance_snapshot,subtotal,tax_total,total,issued_at) values('QA-FROZEN','issued',${clientId},'2026-09-15','2026-10-15','MAD','{}','{}','{}','100','0','100','2026-09-15T12:00:00Z')`
    const id = await schedule(testUserId)
    const { reporting } = reportWorkers()
    const runId = await materialize(id, reporting)
    failExcelUpload = true
    await fixture.client`update report_runs set max_attempts=1 where id=${runId}`
    expect(await reporting.worker.runOne()).toBe(true)
    const [failed] =
      await fixture.client`select status,data_snapshot,data_captured_at from report_runs where id=${runId}`
    expect(failed!.status).toBe('failed')
    const before =
      await fixture.client`select id,object_key,sha256 from document_artifacts where document_id=${runId}`
    expect(before).toHaveLength(1)
    const pdfBytes = files.get(before[0]!.object_key)!
    await fixture.client`update invoices set total='900',subtotal='900' where number='QA-FROZEN'`
    failExcelUpload = false
    const retry = await request('POST', `/v1/report-runs/${runId}/retry`, {})
    expect(retry.statusCode, retry.body).toBe(200)
    expect(await reporting.worker.runOne()).toBe(true)
    const [saved] =
      await fixture.client`select status,data_snapshot,data_captured_at from report_runs where id=${runId}`
    expect(saved).toEqual({ ...failed, status: 'succeeded' })
    const after =
      await fixture.client`select id,object_key,sha256 from document_artifacts where document_id=${runId} and format='pdf'`
    expect(after).toEqual(before)
    expect(files.get(after[0]!.object_key)).toEqual(pdfBytes)
    const [excel] =
      await fixture.client`select object_key from document_artifacts where document_id=${runId} and format='xlsx'`
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(files.get(excel!.object_key)! as unknown as ExcelJS.Buffer)
    const values = workbook.worksheets.flatMap((sheet) => sheet.getSheetValues()).flat(2)
    expect(values).toContain(100)
    expect(values).not.toContain(900)
    expect(
      await fixture.client`select id from notification_dispatches where source_id=${runId}`,
    ).toHaveLength(1)
  }, 20000)

  it('recovers a scheduler crash on its final leased attempt through explicit bounded retry', async () => {
    const id = await schedule(testUserId)
    const { reporting } = reportWorkers()
    const runId = await materialize(id, reporting)
    await fixture.client`update report_runs set status='running',attempts=5,max_attempts=5,lease_token=${randomUUID()},locked_until='2026-10-04T11:59:00Z',started_at='2026-10-04T11:58:00Z' where id=${runId}`
    expect(await reporting.worker.runOne()).toBe(false)
    const [failed] =
      await fixture.client`select status,error_code,lease_token,locked_until,attempts from report_runs where id=${runId}`
    expect(failed).toMatchObject({
      status: 'failed',
      error_code: 'LEASE_EXPIRED_FINAL_ATTEMPT',
      lease_token: null,
      locked_until: null,
      attempts: 5,
    })
    const retry = await request('POST', `/v1/report-runs/${runId}/retry`, {})
    expect(retry.statusCode, retry.body).toBe(200)
    expect(retry.json()).toMatchObject({ attempts: 5, maxAttempts: 10 })
    expect(await reporting.worker.runOne()).toBe(true)
    const [saved] = await fixture.client`select status,attempts from report_runs where id=${runId}`
    expect(saved).toMatchObject({ status: 'succeeded', attempts: 6 })
  }, 20000)

  it('fences stale report completion after another worker takes over an expired lease', async () => {
    const id = await schedule(testUserId)
    const { reporting } = reportWorkers()
    const runId = await materialize(id, reporting)
    let releaseUpload!: () => void
    let enteredUpload!: () => void
    const paused = new Promise<void>((resolve) => {
      enteredUpload = resolve
    })
    const released = new Promise<void>((resolve) => {
      releaseUpload = resolve
    })
    let first = true
    beforeUpload = async (key) => {
      if (!first || !key.endsWith('.pdf')) return
      first = false
      enteredUpload()
      await released
    }
    const stale = reporting.worker.runOne()
    try {
      await paused
      const [captured] =
        await fixture.client`select data_snapshot,data_captured_at,lease_token from report_runs where id=${runId}`
      expect(captured!.data_snapshot).toBeTruthy()
      clock = new Date(clock.getTime() + 300001)
      expect(await reporting.worker.runOne()).toBe(true)
      const artifacts =
        await fixture.client`select id,object_key,sha256 from document_artifacts where document_id=${runId} order by format`
      expect(artifacts).toHaveLength(2)
      releaseUpload()
      expect(await stale).toBe(true)
      const [saved] =
        await fixture.client`select status,attempts,data_snapshot,data_captured_at,lease_token from report_runs where id=${runId}`
      expect(saved).toMatchObject({
        status: 'succeeded',
        attempts: 2,
        data_snapshot: captured!.data_snapshot,
        data_captured_at: captured!.data_captured_at,
        lease_token: null,
      })
      expect(
        await fixture.client`select id,object_key,sha256 from document_artifacts where document_id=${runId} order by format`,
      ).toEqual(artifacts)
      expect(
        await fixture.client`select id from notification_dispatches where source_id=${runId}`,
      ).toHaveLength(1)
    } finally {
      releaseUpload()
      await stale
    }
  }, 20000)

  it('aggregates a stable client identity across invoices with changed snapshot labels', async () => {
    for (const [index, label, total] of [
      [1, 'Previous legal name', '100'],
      [2, 'Renamed client', '200'],
    ] as const) {
      await fixture.client`insert into invoices(number,status,client_id,issue_date,due_date,currency,issuer_snapshot,client_snapshot,appearance_snapshot,subtotal,tax_total,total,issued_at) values(${`QA-CLIENT-${index}`},'issued',${clientId},'2026-09-15','2026-10-15','MAD','{}',${JSON.stringify({ legalName: label })}::jsonb,'{}',${total},'0',${total},'2026-09-15T12:00:00Z')`
    }
    const response = await request(
      'GET',
      '/v1/reports/analysis?from=2026-09-01&to=2026-09-30&timezone=UTC&sections=sales_by_client',
    )
    expect(response.statusCode, response.body).toBe(200)
    const section = ReportAnalysisSchema.parse(response.json()).sections[0]!
    expect(section.total).toBe(1)
    expect(section.rows).toHaveLength(1)
    expect(section.rows[0]).toMatchObject({
      id: clientId,
      currency: 'MAD',
      gross: '300.00',
      quantity: '2',
    })
  })
})
