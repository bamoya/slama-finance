import { randomUUID } from 'node:crypto'

import { and, asc, eq, inArray, sql } from 'drizzle-orm'

import { documentArtifacts } from '../../../../../db/schema/artifacts.js'
import {
  notificationDispatches,
  outboundMessageAttachments,
  outboundMessages,
} from '../../../../../db/schema/notifications.js'
import {
  reportRuns,
  reportScheduleRecipients,
  reportSchedules,
} from '../../../../../db/schema/reporting.js'
import { auditEvents } from '../../../../../db/schema/settings.js'
import type {
  ListReportScheduleRunsQuery,
  ReportAnalysis,
  ReportRecipientDelivery,
  ReportSchedule,
} from '../../../../contracts/generated/reporting/reporting.schemas.js'
import type { Database, Transaction } from '../../../../lib/db.js'
import { AppError } from '../../../../lib/errors.js'

export type ScheduleRow = typeof reportSchedules.$inferSelect
export type RunRow = typeof reportRuns.$inferSelect
export function createScheduleRepository(database: () => Database) {
  const one = async (id: string, tx: Transaction, lock = false) => {
    const q = tx.select().from(reportSchedules).where(eq(reportSchedules.id, id))
    const [row] = lock ? await q.for('update') : await q
    if (!row) throw new AppError(404, 'REPORT_SCHEDULE_NOT_FOUND', 'Report schedule not found.')
    return row
  }
  const run = async (id: string, tx: Transaction, lock = false) => {
    const q = tx.select().from(reportRuns).where(eq(reportRuns.id, id))
    const [row] = lock ? await q.for('update') : await q
    if (!row) throw new AppError(404, 'REPORT_RUN_NOT_FOUND', 'Report run not found.')
    return row
  }
  const recipients = (id: string, tx: Transaction) =>
    tx
      .select({ userId: reportScheduleRecipients.userId })
      .from(reportScheduleRecipients)
      .where(eq(reportScheduleRecipients.scheduleId, id))
      .orderBy(asc(reportScheduleRecipients.userId))
  return {
    async pinFile(id: string, key: string, tx: Transaction) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 91036))`)
      const [artifact] = await tx
        .select()
        .from(documentArtifacts)
        .where(
          and(
            eq(documentArtifacts.documentType, 'report_run'),
            eq(documentArtifacts.documentId, id),
            eq(documentArtifacts.objectKey, key),
          ),
        )
      if (!artifact)
        throw new AppError(
          409,
          'ARTIFACT_CHANGED',
          'The frozen report file is no longer available.',
        )
      return artifact
    },
    async metrics(now: Date) {
      const [row] = await database().execute<{
        queued: number
        running: number
        failed: number
        retried: number
        oldestEligibleAgeSeconds: number
        scheduleLagSeconds: number
      }>(sql`select count(*) filter(where status='queued')::int as queued,
        count(*) filter(where status='running')::int as running,
        count(*) filter(where status='failed')::int as failed,
        count(*) filter(where attempts>1)::int as retried,
        coalesce(greatest(0,extract(epoch from (${now.toISOString()}::timestamptz-min(next_attempt_at) filter(where status='queued' and next_attempt_at<=${now.toISOString()}::timestamptz)))),0)::float8 as "oldestEligibleAgeSeconds",
        (select coalesce(greatest(0,extract(epoch from (${now.toISOString()}::timestamptz-min(next_run_at)))),0)::float8 from report_schedules where enabled and archived_at is null) as "scheduleLagSeconds"
        from report_runs`)
      return row!
    },
    transaction: <T>(work: (tx: Transaction) => Promise<T>) => database().transaction(work),
    snapshot: <T>(work: (tx: Transaction) => Promise<T>) =>
      database().transaction(work, { isolationLevel: 'repeatable read' }),
    authorizeLock: (tx: Transaction) => tx.execute(sql`select pg_advisory_xact_lock(73619001)`),
    one,
    run,
    recipients,
    async list(
      input: {
        search?: string
        frequency?: string
        status?: string
        limit: number
        offset: number
      },
      allowed: string[],
      tx: Transaction,
    ) {
      const where = and(
        sql`${reportSchedules.includedSections} <@ array[${sql.join(
          allowed.map((key) => sql`${key}`),
          sql`, `,
        )}]::text[]`,
        input.search ? sql`${reportSchedules.name} ilike ${`%${input.search}%`}` : undefined,
        input.frequency ? eq(reportSchedules.frequency, input.frequency) : undefined,
        input.status === 'all'
          ? undefined
          : input.status === 'archived'
            ? sql`${reportSchedules.archivedAt} is not null`
            : input.status === 'disabled'
              ? sql`${reportSchedules.archivedAt} is null and not ${reportSchedules.enabled}`
              : sql`${reportSchedules.archivedAt} is null and ${reportSchedules.enabled}`,
      )
      const items = await tx
        .select()
        .from(reportSchedules)
        .where(where)
        .orderBy(reportSchedules.name, reportSchedules.id)
        .limit(input.limit)
        .offset(input.offset)
      const [count] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(reportSchedules)
        .where(where)
      const joins = items.length
        ? await tx
            .select()
            .from(reportScheduleRecipients)
            .where(
              inArray(
                reportScheduleRecipients.scheduleId,
                items.map((item) => item.id),
              ),
            )
        : []
      return {
        items: items.map((row) => ({
          ...row,
          recipientIds: joins
            .filter((join) => join.scheduleId === row.id)
            .map((join) => join.userId),
        })),
        total: count?.total ?? 0,
      }
    },
    async insert(data: typeof reportSchedules.$inferInsert, ids: string[], tx: Transaction) {
      const [row] = await tx.insert(reportSchedules).values(data).returning()
      await tx.insert(reportScheduleRecipients).values(
        ids.map((userId) => ({
          scheduleId: row!.id,
          userId,
          createdByUserId: data.createdByUserId,
        })),
      )
      return row!
    },
    async update(
      id: string,
      data: Partial<typeof reportSchedules.$inferInsert>,
      tx: Transaction,
      ids?: string[],
    ) {
      const [row] = await tx
        .update(reportSchedules)
        .set({ ...data, version: sql`${reportSchedules.version}+1`, updatedAt: new Date() })
        .where(eq(reportSchedules.id, id))
        .returning()
      if (ids) {
        await tx.delete(reportScheduleRecipients).where(eq(reportScheduleRecipients.scheduleId, id))
        await tx.insert(reportScheduleRecipients).values(
          ids.map((userId) => ({
            scheduleId: id,
            userId,
            createdByUserId: data.updatedByUserId,
          })),
        )
      }
      return row!
    },
    async remove(id: string, tx: Transaction) {
      const [exists] = await tx
        .select({ id: reportRuns.id })
        .from(reportRuns)
        .where(eq(reportRuns.scheduleId, id))
        .limit(1)
      if (exists)
        throw new AppError(
          409,
          'REPORT_SCHEDULE_HAS_RUNS',
          'Archive this schedule to preserve its run history.',
        )
      await tx.delete(reportSchedules).where(eq(reportSchedules.id, id))
    },
    async cancelPending(id: string, now: Date, tx: Transaction) {
      await tx
        .update(reportRuns)
        .set({ status: 'cancelled', finishedAt: now, errorCode: 'SCHEDULE_DISABLED' })
        .where(
          and(
            eq(reportRuns.scheduleId, id),
            eq(reportRuns.status, 'queued'),
            sql`${reportRuns.dataSnapshot} is null`,
          ),
        )
      return tx
        .select({ messageId: notificationDispatches.messageId })
        .from(notificationDispatches)
        .innerJoin(reportRuns, eq(reportRuns.id, notificationDispatches.sourceId))
        .innerJoin(outboundMessages, eq(outboundMessages.id, notificationDispatches.messageId))
        .where(
          and(
            eq(notificationDispatches.sourceType, 'report_run'),
            eq(reportRuns.scheduleId, id),
            eq(outboundMessages.status, 'queued'),
          ),
        )
        .for('update', { of: outboundMessages })
    },
    async due(now: Date, tx: Transaction) {
      return tx
        .select()
        .from(reportSchedules)
        .where(
          sql`${reportSchedules.enabled} and ${reportSchedules.archivedAt} is null and ${reportSchedules.nextRunAt} <= ${now.toISOString()}`,
        )
        .orderBy(reportSchedules.nextRunAt)
        .limit(25)
        .for('update', { skipLocked: true })
    },
    insertRun(
      config: ReportSchedule,
      scheduledFor: Date,
      period: { from: string; to: string },
      now: Date,
      tx: Transaction,
    ) {
      return tx
        .insert(reportRuns)
        .values({
          scheduleId: config.id,
          scheduledFor,
          periodStart: period.from,
          periodEnd: period.to,
          configurationSnapshot: config,
          nextAttemptAt: now,
          createdByUserId: null,
        })
        .onConflictDoNothing()
    },
    async recentTest(scheduleId: string, actor: string, now: Date, tx: Transaction) {
      const [row] = await tx
        .select()
        .from(reportRuns)
        .where(
          sql`${reportRuns.scheduleId}=${scheduleId} and ${reportRuns.trigger}='test' and ${reportRuns.createdByUserId}=${actor} and (${reportRuns.status} in ('queued','running') or ${reportRuns.createdAt} > ${new Date(now.getTime() - 60000).toISOString()}::timestamptz)`,
        )
        .orderBy(sql`${reportRuns.createdAt} desc`)
        .limit(1)
      return row
    },
    async insertTest(
      config: ReportSchedule,
      actor: string,
      period: { from: string; to: string },
      now: Date,
      tx: Transaction,
    ) {
      const [row] = await tx
        .insert(reportRuns)
        .values({
          scheduleId: config.id,
          trigger: 'test',
          scheduledFor: now,
          periodStart: period.from,
          periodEnd: period.to,
          configurationSnapshot: { ...config, recipientIds: [actor] },
          nextAttemptAt: now,
          createdAt: now,
          createdByUserId: actor,
        })
        .returning()
      return row!
    },
    advance(id: string, next: Date, tx: Transaction) {
      return tx.update(reportSchedules).set({ nextRunAt: next }).where(eq(reportSchedules.id, id))
    },
    async runs(id: string, input: ListReportScheduleRunsQuery, tx: Transaction) {
      const { limit, offset, search, status, trigger, from, to } = input
      const where = and(
        eq(reportRuns.scheduleId, id),
        status ? eq(reportRuns.status, status) : undefined,
        trigger ? eq(reportRuns.trigger, trigger) : undefined,
        from ? sql`${reportRuns.periodStart} >= ${from}` : undefined,
        to ? sql`${reportRuns.periodStart} <= ${to}` : undefined,
        search
          ? sql`position(lower(${search}) in lower(concat(${reportRuns.id}::text, ' ', ${reportRuns.configurationSnapshot}->>'name', ' ', ${reportRuns.periodStart}, ' ', ${reportRuns.periodEnd}))) > 0`
          : undefined,
      )
      const items = await tx
        .select()
        .from(reportRuns)
        .where(where)
        .orderBy(sql`${reportRuns.scheduledFor} desc`, reportRuns.id)
        .limit(limit)
        .offset(offset)
      const [count] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(reportRuns)
        .where(where)
      const [storage] = await tx
        .select({ bytes: sql<string>`coalesce(sum(${documentArtifacts.byteSize}), 0)` })
        .from(reportRuns)
        .innerJoin(
          documentArtifacts,
          and(
            eq(documentArtifacts.documentType, 'report_run'),
            eq(documentArtifacts.documentId, reportRuns.id),
          ),
        )
        .where(where)
      return { items, total: count?.total ?? 0, storageBytes: Number(storage?.bytes ?? 0) }
    },
    async hasDeliveryAttachment(messageId: string, tx: Transaction) {
      const [row] = await tx
        .select({ id: outboundMessageAttachments.id })
        .from(outboundMessageAttachments)
        .where(eq(outboundMessageAttachments.messageId, messageId))
        .limit(1)
      return !!row
    },
    async files(id: string, tx: Transaction) {
      return tx
        .select()
        .from(documentArtifacts)
        .where(
          and(
            eq(documentArtifacts.documentType, 'report_run'),
            eq(documentArtifacts.documentId, id),
          ),
        )
        .orderBy(documentArtifacts.format)
    },
    async deliveries(id: string, tx: Transaction) {
      return tx
        .select({
          messageId: outboundMessages.id,
          status: outboundMessages.status,
          userId: notificationDispatches.occurrenceKey,
          reason: outboundMessages.lastErrorCode,
        })
        .from(notificationDispatches)
        .innerJoin(outboundMessages, eq(outboundMessages.id, notificationDispatches.messageId))
        .where(
          and(
            eq(notificationDispatches.sourceType, 'report_run'),
            eq(notificationDispatches.sourceId, id),
          ),
        )
    },
    async claim(now: Date, leaseMs: number, tx: Transaction) {
      await tx
        .update(reportRuns)
        .set({
          status: 'failed',
          leaseToken: null,
          lockedUntil: null,
          finishedAt: now,
          errorCode: 'LEASE_EXPIRED_FINAL_ATTEMPT',
        })
        .where(
          sql`${reportRuns.status}='running' and ${reportRuns.lockedUntil}<=${now.toISOString()} and ${reportRuns.attempts}>=${reportRuns.maxAttempts}`,
        )
      const [row] = await tx
        .select()
        .from(reportRuns)
        .where(
          sql`((${reportRuns.status}='queued' and ${reportRuns.nextAttemptAt}<=${now.toISOString()}) or (${reportRuns.status}='running' and ${reportRuns.lockedUntil}<=${now.toISOString()})) and ${reportRuns.attempts}<${reportRuns.maxAttempts}`,
        )
        .orderBy(reportRuns.nextAttemptAt, reportRuns.id)
        .limit(1)
        .for('update', { skipLocked: true })
      if (!row) return null
      const [claimed] = await tx
        .update(reportRuns)
        .set({
          status: 'running',
          attempts: row.attempts + 1,
          leaseToken: randomUUID(),
          lockedUntil: new Date(now.getTime() + leaseMs),
          startedAt: row.startedAt ?? now,
          finishedAt: null,
          errorCode: null,
        })
        .where(eq(reportRuns.id, row.id))
        .returning()
      return claimed!
    },
    async saveCapture(
      id: string,
      token: string,
      snapshot: ReportAnalysis,
      tx: Transaction,
      now: Date,
    ) {
      return tx
        .update(reportRuns)
        .set({ dataSnapshot: snapshot, dataCapturedAt: new Date(snapshot.capturedAt) })
        .where(
          and(
            eq(reportRuns.id, id),
            eq(reportRuns.leaseToken, token),
            eq(reportRuns.status, 'running'),
            sql`${reportRuns.dataSnapshot} is null and ${reportRuns.lockedUntil}>${now.toISOString()}`,
          ),
        )
        .returning()
        .then((rows) => rows[0] ?? null)
    },
    async heartbeat(id: string, token: string, now: Date, leaseMs: number, tx: Transaction) {
      const [row] = await tx
        .update(reportRuns)
        .set({ lockedUntil: new Date(now.getTime() + leaseMs) })
        .where(
          and(
            eq(reportRuns.id, id),
            eq(reportRuns.leaseToken, token),
            eq(reportRuns.status, 'running'),
            sql`${reportRuns.lockedUntil}>${now.toISOString()}`,
          ),
        )
        .returning({ id: reportRuns.id })
      return Boolean(row)
    },
    async complete(
      id: string,
      token: string,
      outcomes: ReportRecipientDelivery[],
      now: Date,
      tx: Transaction,
    ) {
      return tx
        .update(reportRuns)
        .set({
          status: 'succeeded',
          recipientOutcomes: outcomes,
          finishedAt: now,
          leaseToken: null,
          lockedUntil: null,
          errorCode: null,
        })
        .where(
          and(
            eq(reportRuns.id, id),
            eq(reportRuns.leaseToken, token),
            eq(reportRuns.status, 'running'),
            sql`${reportRuns.lockedUntil}>${now.toISOString()}`,
          ),
        )
        .returning()
        .then((rows) => rows[0] ?? null)
    },
    dispatch(id: string, userId: string, messageId: string, tx: Transaction) {
      return tx
        .insert(notificationDispatches)
        .values({
          sourceType: 'report_run',
          sourceId: id,
          eventKey: 'report_available',
          occurrenceKey: userId,
          logicalOccurrenceKey: userId,
          messageId,
        })
        .onConflictDoNothing()
    },
    async fail(id: string, token: string, code: string, now: Date, tx: Transaction) {
      const row = await run(id, tx, true)
      if (
        row.leaseToken !== token ||
        row.status !== 'running' ||
        !row.lockedUntil ||
        row.lockedUntil <= now
      )
        return
      const terminal = row.attempts >= row.maxAttempts
      await tx
        .update(reportRuns)
        .set({
          status: terminal ? 'failed' : 'queued',
          leaseToken: null,
          lockedUntil: null,
          errorCode: code,
          nextAttemptAt: new Date(now.getTime() + Math.min(3600000, 1000 * 2 ** row.attempts)),
          finishedAt: terminal ? now : null,
        })
        .where(eq(reportRuns.id, id))
    },
    retry(id: string, now: Date, tx: Transaction) {
      return tx
        .update(reportRuns)
        .set({
          status: 'queued',
          maxAttempts: sql`${reportRuns.attempts}+5`,
          nextAttemptAt: now,
          errorCode: null,
          finishedAt: null,
        })
        .where(eq(reportRuns.id, id))
    },
    async queuedForStaff(ids: string[], tx: Transaction) {
      return tx
        .select({
          messageId: notificationDispatches.messageId,
          runId: notificationDispatches.sourceId,
          userId: notificationDispatches.occurrenceKey,
          to: outboundMessages.to,
        })
        .from(notificationDispatches)
        .innerJoin(outboundMessages, eq(outboundMessages.id, notificationDispatches.messageId))
        .where(
          and(
            eq(notificationDispatches.sourceType, 'report_run'),
            inArray(notificationDispatches.occurrenceKey, ids),
            eq(outboundMessages.status, 'queued'),
          ),
        )
        .for('update', { of: outboundMessages })
    },
    ownedByStaff(ids: string[], tx: Transaction) {
      return tx
        .select()
        .from(reportSchedules)
        .where(
          and(inArray(reportSchedules.createdByUserId, ids), eq(reportSchedules.enabled, true)),
        )
        .for('update')
    },
    async dispatchRecipient(messageId: string, tx: Transaction) {
      const [row] = await tx
        .select({ userId: notificationDispatches.occurrenceKey, to: outboundMessages.to })
        .from(notificationDispatches)
        .innerJoin(outboundMessages, eq(outboundMessages.id, notificationDispatches.messageId))
        .where(
          and(
            eq(notificationDispatches.sourceType, 'report_run'),
            eq(notificationDispatches.messageId, messageId),
          ),
        )
      return row
    },
    audit(
      tx: Transaction,
      actor: string | null,
      action: string,
      id: string,
      before: unknown,
      after: unknown,
      table = 'report_schedules',
    ) {
      return tx.insert(auditEvents).values({
        actorUserId: actor,
        actorKind: actor ? 'user' : 'system',
        action,
        entityTable: table,
        entityKey: { id },
        beforeValues: before,
        afterValues: after,
      })
    },
  }
}
