import {
  type ListReportScheduleRunsQuery,
  ReportAnalysisSchema,
  type ReportCriteria,
  type ReportRecipientDelivery,
  type ReportRun,
  type ReportSchedule,
  type ReportScheduleInput,
  ReportScheduleSchema,
  type ReportScheduleUpdate,
} from '../../../../contracts/generated/reporting/reporting.schemas.js'
import type { ReportSchedulePreviewInput } from '../../../../contracts/generated/reporting/schedule-preview.schemas.js'
import type { Transaction } from '../../../../lib/db.js'
import { AppError } from '../../../../lib/errors.js'
import { observeWorker, type WorkerObserver } from '../../../../lib/worker-observer.js'
import type {
  ArtifactOwnerAccess,
  createArtifactSupport,
} from '../../../../support/artifacts/index.js'
import type { NotificationPublicApi } from '../../../../support/notifications/index.js'
import type { IdentityPublicApi } from '../../../identity/identity.public.js'
import {
  assertReportPermissions,
  type createAnalysisService,
  REPORT_SECTIONS,
} from '../../analysis/services/analysis.service.js'
import { composeReportEmail } from '../../shared/services/report-email.service.js'
import { reportFormats } from '../../shared/services/report-output.js'
import { renderReport } from '../../shared/services/report-renderer.service.js'
import {
  localInstant,
  nextOccurrence,
  occurrencePeriod,
  REPORT_LIMITS,
} from '../../shared/services/report-time.service.js'
import type {
  createScheduleRepository,
  RunRow,
  ScheduleRow,
} from '../repositories/schedule.repository.js'

type Options = {
  clock?: () => Date
  notifications?: NotificationPublicApi
  sender?: { email: string; name: string }
  uiOrigin?: string
  leaseMs?: number
  observe?: WorkerObserver
}
export function createScheduleService(
  repo: ReturnType<typeof createScheduleRepository>,
  identity: IdentityPublicApi,
  analysis: ReturnType<typeof createAnalysisService>,
  options: Options = {},
) {
  const now = options.clock ?? (() => new Date())
  const dto = (row: ScheduleRow, recipientIds: string[]): ReportSchedule => {
    const { createdByUserId: _created, updatedByUserId: _updated, ...rest } = row
    return ReportScheduleSchema.parse({
      ...rest,
      recipientIds,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      nextRunAt: row.nextRunAt?.toISOString() ?? null,
      archivedAt: row.archivedAt?.toISOString() ?? null,
    })
  }
  // Strip persistence-only audit columns before strict contract validation.
  const config = async (row: ScheduleRow, tx: Transaction) => {
    const { createdByUserId: _created, updatedByUserId: _updated, ...rest } = row
    return dto(
      rest as ScheduleRow,
      (await repo.recipients(row.id, tx)).map((item) => item.userId),
    )
  }
  const authorize = async (actor: string, tx: Transaction) => {
    await repo.authorizeLock(tx)
    assertReportPermissions(await identity.grants(actor, tx))
  }
  function validate(input: ReportSchedulePreviewInput) {
    if (
      input.frequency === 'weekly'
        ? input.weekday === null || input.monthDay !== null
        : input.frequency === 'monthly'
          ? input.monthDay === null || input.weekday !== null
          : input.weekday !== null || input.monthDay !== null
    )
      throw new AppError(
        400,
        'INVALID_REPORT_CADENCE',
        'Select weekday only for weekly schedules, and month day only for monthly schedules.',
      )
    localInstant('2026-01-01', input.localTime, input.timezone)
  }
  async function eligible(input: ReportScheduleInput, tx: Transaction) {
    for (const id of input.recipientIds) {
      const recipient = await identity.reportingRecipient(id, input.includedSections, tx)
      if (!recipient?.eligible)
        throw new AppError(
          400,
          'INELIGIBLE_REPORT_RECIPIENT',
          `Recipient ${id} must be active and able to read/export every selected section and report run.`,
        )
    }
  }
  async function materialize(row: ScheduleRow, tx: Transaction) {
    let occurrence = row.nextRunAt
    const snapshot = await config(row, tx)
    let count = 0
    const clock = now()
    while (occurrence && occurrence <= clock && count < REPORT_LIMITS.catchUp) {
      await repo.insertRun(snapshot, occurrence, occurrencePeriod(row, occurrence), clock, tx)
      occurrence = nextOccurrence(row, occurrence)
      count++
    }
    if (occurrence) await repo.advance(row.id, occurrence, tx)
    return occurrence
  }
  async function runDto(row: RunRow, tx: Transaction): Promise<ReportRun> {
    const deliveries = await repo.deliveries(row.id, tx)
    const outcomes = (row.recipientOutcomes ?? []) as ReportRecipientDelivery[]
    const merged = new Map(outcomes.map((item) => [item.userId, item]))
    for (const item of deliveries)
      merged.set(item.userId, { ...item, status: item.status as ReportRecipientDelivery['status'] })
    return {
      id: row.id,
      trigger: row.trigger as ReportRun['trigger'],
      scheduleId: row.scheduleId,
      scheduledFor: row.scheduledFor.toISOString(),
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      status: row.status as ReportRun['status'],
      attempts: row.attempts,
      maxAttempts: row.maxAttempts,
      dataCapturedAt: row.dataCapturedAt?.toISOString() ?? null,
      startedAt: row.startedAt?.toISOString() ?? null,
      finishedAt: row.finishedAt?.toISOString() ?? null,
      errorCode: row.errorCode,
      configurationSnapshot: ReportScheduleSchema.parse(row.configurationSnapshot),
      dataSnapshot: row.dataSnapshot ? ReportAnalysisSchema.parse(row.dataSnapshot) : null,
      artifacts: (await repo.files(row.id, tx)).map((file) => ({
        id: file.id,
        format: file.format as 'pdf' | 'csv' | 'xlsx',
        mimeType: file.mimeType,
        byteSize: file.byteSize,
        createdAt: file.generatedAt.toISOString(),
      })),
      deliveries: [...merged.values()],
    }
  }
  const capturedSections = (row: RunRow) =>
    ReportScheduleSchema.parse(row.configurationSnapshot).includedSections
  const owners: ArtifactOwnerAccess = {
    async assertPublishable(tx, type, id, version) {
      const row = await repo.run(id, tx, true)
      if (
        type !== 'report_run' ||
        version !== 1 ||
        !row.dataSnapshot ||
        !['running', 'succeeded'].includes(row.status)
      )
        throw new AppError(409, 'REPORT_NOT_CAPTURED', 'Report results have not been captured.')
    },
    async assertReadable(tx, type, id, actor) {
      if (type !== 'report_run')
        throw new AppError(404, 'ARTIFACT_NOT_FOUND', 'Report artifact not found.')
      await repo.run(id, tx)
      await authorize(actor, tx)
    },
  }
  return {
    metrics: () => repo.metrics(now()),
    async sendTest(id: string, expectedVersion: number, actor: string) {
      return repo.transaction(async (tx) => {
        await authorize(actor, tx)
        const row = await repo.one(id, tx, true)
        if (row.archivedAt || row.version !== expectedVersion)
          throw new AppError(
            409,
            'REPORT_SCHEDULE_CONFLICT',
            'Reload the active schedule before sending a test.',
          )
        if (!options.notifications || !options.sender || !options.uiOrigin)
          throw new AppError(503, 'EMAIL_UNAVAILABLE', 'Email delivery is not configured.')
        const configuration = await config(row, tx)
        const recipient = await identity.reportingRecipient(
          actor,
          configuration.includedSections,
          tx,
        )
        if (!recipient?.eligible)
          throw new AppError(
            403,
            'REPORT_RECIPIENT_INELIGIBLE',
            'Your account cannot receive this report.',
          )
        const clock = now()
        const existing = await repo.recentTest(id, actor, clock, tx)
        if (existing) return runDto(existing, tx)
        const run = await repo.insertTest(
          configuration,
          actor,
          occurrencePeriod(row, clock),
          clock,
          tx,
        )
        await repo.audit(
          tx,
          actor,
          'test_email',
          run.id,
          null,
          { scheduleId: id, recipientId: actor },
          'report_runs',
        )
        return runDto(run, tx)
      })
    },
    async preview(input: ReportSchedulePreviewInput, actor: string) {
      validate(input)
      await repo.transaction((tx) => authorize(actor, tx))
      const next = nextOccurrence(input, now())
      const period = occurrencePeriod(input, next)
      return {
        nextRunAt: next.toISOString(),
        periodStart: period.from,
        periodEnd: period.to,
        timezone: input.timezone,
      }
    },
    owners,
    async list(
      input: {
        search?: string
        frequency?: string
        status?: string
        limit: number
        offset: number
      },
      actor: string,
    ) {
      return repo.transaction(async (tx) => {
        await authorize(actor, tx)
        const result = await repo.list(input, REPORT_SECTIONS, tx)
        return {
          ...result,
          items: result.items.map(({ recipientIds, ...row }) => {
            const { createdByUserId: _c, updatedByUserId: _u, ...rest } = row
            return dto(rest as ScheduleRow, recipientIds)
          }),
          limit: input.limit,
          offset: input.offset,
        }
      })
    },
    get: (id: string, actor: string) =>
      repo.transaction(async (tx) => {
        const row = await repo.one(id, tx)
        await authorize(actor, tx)
        return config(row, tx)
      }),
    async create(input: ReportScheduleInput, actor: string) {
      validate(input)
      return repo.transaction(async (tx) => {
        await authorize(actor, tx)
        await eligible(input, tx)
        const { recipientIds, ...data } = input
        const row = await repo.insert(
          {
            ...data,
            name: data.name.trim(),
            nextRunAt: data.enabled ? nextOccurrence(data, now()) : null,
            createdByUserId: actor,
            updatedByUserId: actor,
          },
          recipientIds,
          tx,
        )
        await repo.audit(tx, actor, 'create', row.id, null, input)
        return config(row, tx)
      })
    },
    async update(id: string, input: ReportScheduleUpdate, actor: string) {
      validate(input)
      const result = await repo.transaction(async (tx) => {
        await repo.authorizeLock(tx)
        const row = await repo.one(id, tx, true)
        await authorize(actor, tx)
        if (row.version !== input.expectedVersion || row.archivedAt)
          throw new AppError(
            409,
            'REPORT_SCHEDULE_CONFLICT',
            'Reload the active schedule before editing.',
          )
        const next = row.enabled ? await materialize(row, tx) : null
        if (next && next <= now()) return null
        await eligible(input, tx)
        const { recipientIds, expectedVersion: _version, ...data } = input
        const changed = await repo.update(
          id,
          {
            ...data,
            name: data.name.trim(),
            nextRunAt: data.enabled ? nextOccurrence(data, now()) : null,
            updatedByUserId: actor,
          },
          tx,
          recipientIds,
        )
        if (!data.enabled) {
          for (const item of await repo.cancelPending(id, now(), tx))
            await options.notifications?.cancel(item.messageId, tx)
        }
        await repo.audit(tx, actor, 'update', id, row, data)
        return config(changed, tx)
      })
      if (!result)
        throw new AppError(
          409,
          'REPORT_CATCH_UP_IN_PROGRESS',
          'Due occurrences were preserved. Allow scheduler catch-up, then retry the edit.',
        )
      return result
    },
    action: (
      id: string,
      action: 'enable' | 'disable' | 'archive' | 'restore',
      version: number,
      actor: string,
    ) =>
      repo.transaction(async (tx) => {
        await repo.authorizeLock(tx)
        const row = await repo.one(id, tx, true)
        await authorize(actor, tx)
        if (row.version !== version)
          throw new AppError(
            409,
            'REPORT_SCHEDULE_CONFLICT',
            'Reload the schedule before changing it.',
          )
        if ((action === 'enable' && row.enabled) || (action === 'disable' && !row.enabled))
          throw new AppError(
            409,
            'REPORT_SCHEDULE_STATE',
            `This schedule is already ${row.enabled ? 'enabled' : 'disabled'}.`,
          )
        if ((action === 'restore' && !row.archivedAt) || (action !== 'restore' && row.archivedAt))
          throw new AppError(
            409,
            'REPORT_SCHEDULE_STATE',
            'This action is unavailable for the current schedule state.',
          )
        const enabled = action === 'enable'
        if (enabled)
          await eligible({ ...(await config(row, tx)), enabled: true } as ReportScheduleInput, tx)
        const changed = await repo.update(
          id,
          {
            enabled,
            nextRunAt: enabled ? nextOccurrence(row, now()) : null,
            archivedAt: action === 'archive' ? now() : action === 'restore' ? null : row.archivedAt,
            updatedByUserId: actor,
          },
          tx,
        )
        if (!enabled)
          for (const item of await repo.cancelPending(id, now(), tx))
            await options.notifications?.cancel(item.messageId, tx)
        await repo.audit(tx, actor, action, id, row, changed)
        return config(changed, tx)
      }),
    recipients: (
      input: { sections: string[]; search?: string; limit: number; offset: number },
      actor: string,
    ) =>
      repo.transaction(async (tx) => {
        await authorize(actor, tx)
        return identity.reportingRecipients(input, tx)
      }),
    runs: (id: string, input: ListReportScheduleRunsQuery, actor: string) =>
      repo.transaction(async (tx) => {
        await repo.one(id, tx)
        await authorize(actor, tx)
        if (input.from && input.to && input.from > input.to)
          throw new AppError(
            400,
            'INVALID_REPORT_PERIOD',
            'The start date must precede the end date.',
          )
        const result = await repo.runs(id, input, tx)
        return {
          ...result,
          items: await Promise.all(result.items.map((item) => runDto(item, tx))),
          limit: input.limit,
          offset: input.offset,
        }
      }),
    run: (id: string, actor: string) =>
      repo.transaction(async (tx) => {
        const row = await repo.run(id, tx)
        await authorize(actor, tx)
        return runDto(row, tx)
      }),
    artifacts: (id: string, actor: string) =>
      repo.transaction(async (tx) => {
        const row = await repo.run(id, tx)
        await authorize(actor, tx)
        return (await runDto(row, tx)).artifacts
      }),
    retry: (id: string, actor: string) =>
      repo.transaction(async (tx) => {
        await repo.authorizeLock(tx)
        const row = await repo.run(id, tx, true)
        await authorize(actor, tx)
        if (row.status !== 'failed')
          throw new AppError(
            409,
            'REPORT_RUN_STATE',
            'Only failed report production can be retried.',
          )
        await repo.retry(id, now(), tx)
        await repo.audit(
          tx,
          actor,
          'retry',
          id,
          { status: row.status },
          { status: 'queued' },
          'report_runs',
        )
        return runDto(await repo.run(id, tx), tx)
      }),
    async invalidateStaff(tx: Transaction, ids: string[]) {
      if (!ids.length) return
      for (const row of await repo.ownedByStaff(ids, tx)) {
        const grants = new Set(await identity.grants(row.createdByUserId!, tx))
        if (grants.has('reports.read')) continue
        await repo.update(row.id, { enabled: false, nextRunAt: null }, tx)
        for (const item of await repo.cancelPending(row.id, now(), tx))
          await options.notifications?.cancel(item.messageId, tx)
        await repo.audit(
          tx,
          null,
          'permission_disable',
          row.id,
          { enabled: true },
          { enabled: false },
        )
      }
      for (const item of await repo.queuedForStaff(ids, tx)) {
        const run = await repo.run(item.runId, tx)
        const recipient = await identity.reportingRecipient(item.userId, capturedSections(run), tx)
        if (!recipient?.eligible || recipient.email !== item.to)
          await options.notifications?.cancel(item.messageId, tx)
      }
    },
    reportOwner: {
      async assertReadable(tx: Transaction, id: string, actor: string) {
        await repo.run(id, tx)
        await authorize(actor, tx)
      },
      async assertRetryable(tx: Transaction, id: string, actor: string, messageId?: string) {
        const row = await repo.run(id, tx)
        await authorize(actor, tx)
        const schedule = await repo.one(row.scheduleId, tx)
        if ((!schedule.enabled && row.trigger !== 'test') || schedule.archivedAt)
          throw new AppError(
            409,
            'REPORT_SCHEDULE_DISABLED',
            'Enable the schedule before retrying report notification delivery.',
          )
        if (messageId) {
          if (!(await repo.hasDeliveryAttachment(messageId, tx)))
            throw new AppError(
              409,
              'REPORT_FILES_REMOVED',
              'The email attachments were removed. This historical email cannot be retried.',
            )
          const dispatch = await repo.dispatchRecipient(messageId, tx)
          const recipient = dispatch
            ? await identity.reportingRecipient(dispatch.userId, capturedSections(row), tx)
            : null
          if (!recipient?.eligible || recipient.email !== dispatch?.to)
            throw new AppError(
              409,
              'REPORT_RECIPIENT_INELIGIBLE',
              'The original recipient can no longer open this report.',
            )
        }
      },
    },
    worker: {
      sweep: () =>
        repo.transaction(async (tx) => {
          const rows = await repo.due(now(), tx)
          for (const row of rows) await materialize(row, tx)
          return rows.length
        }),
      async runOne(artifacts: ReturnType<typeof createArtifactSupport>['service']) {
        const claimed = await repo.transaction((tx) =>
          repo.claim(now(), options.leaseMs ?? 300000, tx),
        )
        if (!claimed) return false
        const token = claimed.leaseToken!
        const started = Date.now()
        const leaseMs = options.leaseMs ?? 300000
        let heartbeat: Promise<void> | undefined
        const timer = setInterval(
          () => {
            if (heartbeat) return
            heartbeat = repo
              .transaction((tx) => repo.heartbeat(claimed.id, token, now(), leaseMs, tx))
              .then(() => undefined)
              .catch(() => undefined)
              .finally(() => {
                heartbeat = undefined
              })
          },
          Math.max(1000, Math.floor(leaseMs / 3)),
        )
        timer.unref()
        const guard = async (tx: Transaction) => {
          const row = await repo.run(claimed.id, tx, true)
          if (
            row.leaseToken !== token ||
            row.status !== 'running' ||
            !row.lockedUntil ||
            row.lockedUntil <= now()
          )
            throw new AppError(409, 'REPORT_LEASE_LOST', 'The report worker lease changed.')
        }
        try {
          let snapshot = claimed.dataSnapshot
            ? ReportAnalysisSchema.parse(claimed.dataSnapshot)
            : null
          if (!snapshot) {
            const captureStarted = Date.now()
            snapshot = await repo.snapshot(async (tx) => {
              const row = await repo.run(claimed.id, tx, true)
              if (
                row.leaseToken !== token ||
                row.status !== 'running' ||
                !row.lockedUntil ||
                row.lockedUntil <= now()
              )
                throw new AppError(409, 'REPORT_LEASE_LOST', 'The report worker lease changed.')
              if (row.dataSnapshot) return ReportAnalysisSchema.parse(row.dataSnapshot)
              const configuration = ReportScheduleSchema.parse(row.configurationSnapshot)
              const input = {
                from: row.periodStart,
                to: row.periodEnd,
                timezone: configuration.timezone,
                sections: configuration.includedSections,
                bucket: 'day',
                sort: 'date_desc',
                limit: 25,
                offset: 0,
              } as ReportCriteria
              const data = await analysis.capture(input, null, tx, REPORT_LIMITS.csvRows + 1, [
                'reports.read',
              ])
              if (!(await repo.saveCapture(row.id, token, data, tx, now())))
                throw new AppError(409, 'REPORT_LEASE_LOST', 'The report worker lease changed.')
              return data
            })
            observeWorker(options.observe, {
              worker: 'report',
              event: 'captured',
              id: claimed.id,
              attempt: claimed.attempts,
              durationMs: Date.now() - captureStarted,
            })
          }
          const saved = ReportScheduleSchema.parse(claimed.configurationSnapshot)
          const files = await Promise.all(
            reportFormats(saved.output).map(async (format) => ({
              format,
              bytes: await renderReport(snapshot, format, saved.language),
            })),
          )
          const artifactBytes = files.reduce((sum, file) => sum + file.bytes.length, 0)
          if (artifactBytes > REPORT_LIMITS.artifactBytes)
            throw new AppError(
              400,
              'EXPORT_TOO_LARGE',
              'The combined report attachments exceed 8 MiB.',
            )
          const published: Awaited<ReturnType<typeof artifacts.publishPdf>>[] = []
          for (const file of files) {
            const input = {
              type: 'report_run' as const,
              documentId: claimed.id,
              sourceVersion: 1,
              bytes: file.bytes,
              actor: null,
              guard,
            }
            published.push(
              file.format === 'pdf'
                ? await artifacts.publishPdf(input)
                : await artifacts.publishReportFile({ ...input, format: file.format }),
            )
          }
          await repo.transaction(async (tx) => {
            await repo.authorizeLock(tx)
            const schedule = await repo.one(claimed.scheduleId, tx, true)
            const row = await repo.run(claimed.id, tx, true)
            if (
              row.leaseToken !== token ||
              row.status !== 'running' ||
              !row.lockedUntil ||
              row.lockedUntil <= now()
            )
              throw new AppError(409, 'REPORT_LEASE_LOST', 'The report worker lease changed.')
            const configuration = ReportScheduleSchema.parse(row.configurationSnapshot)
            const outcomes: ReportRecipientDelivery[] = []
            for (const userId of configuration.recipientIds) {
              const recipient = await identity.reportingRecipient(
                userId,
                configuration.includedSections,
                tx,
              )
              const reason =
                (!schedule.enabled && row.trigger !== 'test') || schedule.archivedAt
                  ? 'SCHEDULE_DISABLED'
                  : !recipient?.eligible
                    ? 'RECIPIENT_INELIGIBLE'
                    : !options.notifications || !options.sender || !options.uiOrigin
                      ? 'EMAIL_UNAVAILABLE'
                      : null
              if (reason) {
                outcomes.push({ userId, status: 'skipped', reason, messageId: null })
                continue
              }
              const link = `${options.uiOrigin!.replace(/\/$/, '')}/reports/runs/${row.id}`
              const attachments = []
              for (const file of published.filter((item) => item.format !== 'csv')) {
                const attachment = await repo.pinFile(row.id, file.objectKey, tx)
                attachments.push({
                  objectKey: attachment.objectKey,
                  filename: `report-${snapshot.filters.from}-${snapshot.filters.to}.${file.format}`,
                  contentType: attachment.mimeType,
                  byteSize: attachment.byteSize,
                  position: attachments.length,
                })
              }
              const email = composeReportEmail(
                snapshot,
                configuration.name,
                link,
                configuration.language,
                configuration.output,
              )
              const message = await options.notifications!.enqueue(
                {
                  idempotencyKey: `report:${row.id}:${userId}`,
                  actor: null,
                  from: options.sender!,
                  to: recipient!.email,
                  cc: [],
                  ...email,
                  subject: row.trigger === 'test' ? `[TEST] ${email.subject}` : email.subject,
                  attachments,
                },
                tx,
              )
              await repo.dispatch(row.id, userId, message.id, tx)
              outcomes.push({
                userId,
                status: message.status as ReportRecipientDelivery['status'],
                reason: null,
                messageId: message.id,
              })
            }
            if (!(await repo.complete(row.id, token, outcomes, now(), tx)))
              throw new AppError(409, 'REPORT_LEASE_LOST', 'The report worker lease changed.')
            await repo.audit(
              tx,
              null,
              'produce',
              row.id,
              null,
              { status: 'succeeded', capturedAt: row.dataCapturedAt?.toISOString() },
              'report_runs',
            )
          })
          observeWorker(options.observe, {
            worker: 'report',
            event: 'published',
            id: claimed.id,
            attempt: claimed.attempts,
            durationMs: Date.now() - started,
            artifactBytes,
          })
        } catch (error) {
          observeWorker(options.observe, {
            worker: 'report',
            event: 'failed',
            id: claimed.id,
            attempt: claimed.attempts,
            durationMs: Date.now() - started,
            errorCode: error instanceof AppError ? error.code : 'REPORT_PRODUCTION_FAILED',
          })
          await repo.transaction((tx) =>
            repo.fail(
              claimed.id,
              token,
              error instanceof AppError ? error.code : 'REPORT_PRODUCTION_FAILED',
              now(),
              tx,
            ),
          )
        } finally {
          clearInterval(timer)
          await heartbeat
        }
        return true
      },
    },
  }
}
