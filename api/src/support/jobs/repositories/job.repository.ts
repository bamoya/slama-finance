import { and, eq, gt, inArray, isNotNull, lte, or, sql } from 'drizzle-orm'
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core'

import { backgroundJobs } from '../../../../db/schema/jobs.js'
import type { Database, Transaction } from '../../../lib/db.js'
import { queueSql, queueTime, withQueueSql, type WithQueueTime } from '../../../lib/queue-time.js'

export type BackgroundJob = typeof backgroundJobs.$inferSelect

export function createJobRepository(database: () => Database) {
  return {
    metrics: async (now?: Date) =>
      database().execute<{
        jobType: string
        queued: number
        running: number
        retried: number
        failed: number
        oldestEligibleAgeSeconds: number
      }>(sql`select job_type as "jobType",count(*) filter(where status='queued')::int as queued,
      count(*) filter(where status='running')::int as running,
      count(*) filter(where attempts>1)::int as retried,
      count(*) filter(where status='failed')::int as failed,
      coalesce(greatest(0,extract(epoch from (${queueSql(now)}-min(available_at) filter(where status='queued' and available_at<=${queueSql(now)})))),0)::float8 as "oldestEligibleAgeSeconds"
      from background_jobs group by job_type`),
    transaction: <T>(work: (tx: Transaction) => Promise<T>) => database().transaction(work),
    async enqueue(data: typeof backgroundJobs.$inferInsert, tx: Transaction) {
      const [inserted] = await tx
        .insert(backgroundJobs)
        .values(data)
        .onConflictDoNothing()
        .returning()
      if (inserted) return inserted
      const [existing] = await tx
        .select()
        .from(backgroundJobs)
        .where(eq(backgroundJobs.idempotencyKey, data.idempotencyKey))
      return existing!
    },
    async retryFailed(id: string, tx: Transaction) {
      const [row] = await tx
        .update(backgroundJobs)
        .set({
          status: 'queued',
          attempts: 0,
          availableAt: sql`now()`,
          startedAt: null,
          finishedAt: null,
          lastErrorCode: null,
          leaseToken: null,
          lockedUntil: null,
        })
        .where(and(eq(backgroundJobs.id, id), eq(backgroundJobs.status, 'failed')))
        .returning()
      return row ?? null
    },
    async claim(
      now: Date | undefined,
      leaseToken: string,
      leaseMs: number,
      tx: Transaction,
      supportedTypes: string[] = ['prepare_pdf'],
    ) {
      const at = queueSql(now)
      await tx
        .update(backgroundJobs)
        .set({
          status: 'failed',
          finishedAt: at,
          leaseToken: null,
          lockedUntil: null,
          lastErrorCode: 'LEASE_EXHAUSTED',
        })
        .where(
          and(
            eq(backgroundJobs.status, 'running'),
            inArray(backgroundJobs.jobType, supportedTypes),
            lte(backgroundJobs.lockedUntil, at),
            eq(backgroundJobs.attempts, backgroundJobs.maxAttempts),
          ),
        )
      const [candidate] = await tx
        .select()
        .from(backgroundJobs)
        .where(
          and(
            lte(backgroundJobs.availableAt, at),
            inArray(backgroundJobs.jobType, supportedTypes),
            gt(backgroundJobs.maxAttempts, backgroundJobs.attempts),
            or(
              eq(backgroundJobs.status, 'queued'),
              and(
                eq(backgroundJobs.status, 'running'),
                isNotNull(backgroundJobs.lockedUntil),
                lte(backgroundJobs.lockedUntil, at),
              ),
            ),
          ),
        )
        .orderBy(backgroundJobs.availableAt, backgroundJobs.createdAt)
        .limit(1)
        .for('update', { skipLocked: true })
      if (!candidate) return null
      const [claimed] = await tx
        .update(backgroundJobs)
        .set({
          status: 'running',
          attempts: candidate.attempts + 1,
          leaseToken,
          lockedUntil: queueSql(queueTime(now, leaseMs)),
          startedAt: at,
        })
        .where(eq(backgroundJobs.id, candidate.id))
        .returning()
      return claimed!
    },
    async fence(
      id: string,
      token: string,
      now: Date | undefined,
      changes: WithQueueTime<PgUpdateSetSource<typeof backgroundJobs>>,
      tx: Transaction,
    ) {
      const [row] = await tx
        .update(backgroundJobs)
        .set(withQueueSql(changes))
        .where(
          and(
            eq(backgroundJobs.id, id),
            eq(backgroundJobs.status, 'running'),
            eq(backgroundJobs.leaseToken, token),
            gt(backgroundJobs.lockedUntil, queueSql(now)),
          ),
        )
        .returning()
      return row ?? null
    },
    get(id: string) {
      return database()
        .select()
        .from(backgroundJobs)
        .where(eq(backgroundJobs.id, id))
        .then((rows) => rows[0] ?? null)
    },
    async retryPreparation(id: string, tx: Transaction) {
      const [row] = await tx
        .update(backgroundJobs)
        .set({
          status: 'queued',
          maxAttempts: sql`${backgroundJobs.maxAttempts}+3`,
          availableAt: sql`now()`,
          finishedAt: null,
          leaseToken: null,
          lockedUntil: null,
        })
        .where(
          and(
            eq(backgroundJobs.id, id),
            eq(backgroundJobs.jobType, 'prepare_notification'),
            eq(backgroundJobs.status, 'failed'),
          ),
        )
        .returning()
      return row ?? null
    },
    async cancelPreparation(id: string, tx: Transaction) {
      const [row] = await tx
        .update(backgroundJobs)
        .set({
          status: 'cancelled',
          finishedAt: sql`now()`,
          leaseToken: null,
          lockedUntil: null,
          lastErrorCode: 'CANCELLED',
        })
        .where(
          and(
            eq(backgroundJobs.id, id),
            eq(backgroundJobs.jobType, 'prepare_notification'),
            eq(backgroundJobs.status, 'queued'),
          ),
        )
        .returning()
      return row ?? null
    },
  }
}
