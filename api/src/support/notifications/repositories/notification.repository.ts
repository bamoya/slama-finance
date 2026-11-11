import { and, eq, gt, inArray, isNotNull, lte, or, sql } from 'drizzle-orm'
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core'

import {
  outboundMessageAttachments,
  outboundMessages,
} from '../../../../db/schema/notifications.js'
import type { Database, Transaction } from '../../../lib/db.js'
import { AppError } from '../../../lib/errors.js'
import { queueSql, queueTime, withQueueSql, type WithQueueTime } from '../../../lib/queue-time.js'
import type { ComposedMessage } from '../types/notification.types.js'

export type OutboundMessage = typeof outboundMessages.$inferSelect
/** Provider outcomes older than this are uncertain: never resent automatically. */
const UNCERTAIN_AFTER_MS = 23 * 3600_000

// The same keyed lock protects artifact publication, attachment pins and deletion.
export async function lockStorageReference(tx: Transaction, key: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 91036))`)
}

export function createNotificationRepository(
  database: () => Database,
  reserveEmail?: (tx: Transaction, key: string, recipients: number) => Promise<void>,
) {
  return {
    // `now` is an optional test injection; omitted, the database clock decides (see QueueTime).
    async metrics(now?: Date) {
      const [row] = await database().execute<{
        queued: number
        sending: number
        retried: number
        failed: number
        oldestEligibleAgeSeconds: number
      }>(sql`select count(*) filter(where status='queued')::int as queued,
        count(*) filter(where status='sending')::int as sending,
        count(*) filter(where attempts>1)::int as retried,
        count(*) filter(where status='failed')::int as failed,
        coalesce(greatest(0,extract(epoch from (${queueSql(now)}-min(available_at) filter(where status='queued' and available_at<=${queueSql(now)})))),0)::float8 as "oldestEligibleAgeSeconds"
        from outbound_messages`)
      return row!
    },
    transaction: <T>(fn: (tx: Transaction) => Promise<T>) => database().transaction(fn),
    async enqueue(payload: ComposedMessage, payloadHash: string, tx: Transaction) {
      const [inserted] = await tx
        .insert(outboundMessages)
        .values({
          to: payload.to,
          cc: payload.cc,
          fromEmail: payload.from.email,
          fromName: payload.from.name,
          subject: payload.subject,
          html: payload.html,
          text: payload.text,
          idempotencyKey: payload.idempotencyKey,
          payloadHash,
          createdByActorId: payload.actor,
        })
        .onConflictDoNothing()
        .returning()
      const row = inserted ?? (await this.getByKey(payload.idempotencyKey, tx))
      if (row.payloadHash !== payloadHash)
        throw new AppError(
          409,
          'MESSAGE_CONFLICT',
          'This message identity already has different content.',
        )
      if (inserted)
        await reserveEmail?.(
          tx,
          `${inserted.organizationId}:${inserted.id}`,
          new Set([payload.to, ...payload.cc].map((email) => email.trim().toLowerCase())).size,
        )
      if (inserted && payload.attachments.length) {
        for (const item of [...payload.attachments].sort((a, b) =>
          a.objectKey.localeCompare(b.objectKey),
        ))
          await lockStorageReference(tx, item.objectKey)
        await tx
          .insert(outboundMessageAttachments)
          .values(payload.attachments.map((a) => ({ ...a, messageId: row.id })))
      }
      return row
    },
    async getByKey(key: string, tx: Database | Transaction = database()) {
      const [row] = await tx
        .select()
        .from(outboundMessages)
        .where(eq(outboundMessages.idempotencyKey, key))
      if (!row) throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Message not found.')
      return row
    },
    async get(id: string, tx: Database | Transaction = database(), lock = false) {
      const q = tx.select().from(outboundMessages).where(eq(outboundMessages.id, id))
      const [row] = lock ? await q.for('update') : await q
      if (!row) throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Message not found.')
      return row
    },
    attachments(id: string) {
      return database()
        .select()
        .from(outboundMessageAttachments)
        .where(eq(outboundMessageAttachments.messageId, id))
        .orderBy(outboundMessageAttachments.position)
    },
    async claim(now: Date | undefined, token: string, tx: Transaction) {
      const at = queueSql(now)
      const uncertainBefore = queueSql(queueTime(now, -UNCERTAIN_AFTER_MS))
      await tx
        .update(outboundMessages)
        .set({
          status: 'failed',
          leaseToken: null,
          lockedUntil: null,
          lastErrorCode: 'PROVIDER_OUTCOME_UNCERTAIN',
        })
        .where(
          and(
            eq(outboundMessages.status, 'sending'),
            lte(outboundMessages.lockedUntil, at),
            or(
              eq(outboundMessages.attempts, outboundMessages.maxAttempts),
              lte(outboundMessages.firstAttemptAt, uncertainBefore),
            ),
          ),
        )
      const [found] = await tx
        .select({
          row: outboundMessages,
          uncertain: sql<boolean>`coalesce(${outboundMessages.firstAttemptAt} <= ${uncertainBefore}, false)`,
        })
        .from(outboundMessages)
        .where(
          and(
            lte(outboundMessages.availableAt, at),
            gt(outboundMessages.maxAttempts, outboundMessages.attempts),
            or(
              eq(outboundMessages.status, 'queued'),
              and(
                eq(outboundMessages.status, 'sending'),
                isNotNull(outboundMessages.lockedUntil),
                lte(outboundMessages.lockedUntil, at),
              ),
            ),
          ),
        )
        .orderBy(outboundMessages.availableAt, outboundMessages.createdAt)
        .limit(1)
        .for('update', { skipLocked: true })
      if (!found) return null
      const row = found.row
      if (found.uncertain) {
        await tx
          .update(outboundMessages)
          .set({
            status: 'failed',
            leaseToken: null,
            lockedUntil: null,
            lastErrorCode: 'PROVIDER_OUTCOME_UNCERTAIN',
          })
          .where(eq(outboundMessages.id, row.id))
        return null
      }
      const [claimed] = await tx
        .update(outboundMessages)
        .set({
          status: 'sending',
          attempts: row.attempts + 1,
          leaseToken: token,
          lockedUntil: queueSql(queueTime(now, 30_000)),
          firstAttemptAt: row.firstAttemptAt ?? at,
        })
        .where(eq(outboundMessages.id, row.id))
        .returning()
      return claimed!
    },
    async fence(
      row: OutboundMessage,
      now: Date | undefined,
      changes: WithQueueTime<PgUpdateSetSource<typeof outboundMessages>>,
      tx: Transaction,
    ) {
      const [updated] = await tx
        .update(outboundMessages)
        .set(withQueueSql(changes))
        .where(
          and(
            eq(outboundMessages.id, row.id),
            eq(outboundMessages.status, 'sending'),
            eq(outboundMessages.leaseToken, row.leaseToken!),
            gt(outboundMessages.lockedUntil, queueSql(now)),
          ),
        )
        .returning()
      if (!updated)
        throw new AppError(409, 'STALE_MESSAGE_LEASE', 'Message lease is no longer valid.')
      return updated
    },
    async transition(
      id: string,
      status: 'failed' | 'queued',
      changes: WithQueueTime<PgUpdateSetSource<typeof outboundMessages>>,
      tx: Transaction,
    ) {
      const [row] = await tx
        .update(outboundMessages)
        .set(withQueueSql(changes))
        .where(and(eq(outboundMessages.id, id), eq(outboundMessages.status, status)))
        .returning()
      if (!row)
        throw new AppError(
          409,
          'MESSAGE_ALREADY_CLAIMED',
          'Only queued messages can be cancelled and only failed messages retried.',
        )
      return row
    },
    /** Whether a provider outcome is too old to resend safely (same clock as claim). */
    async uncertain(id: string, now: Date | undefined, tx: Transaction) {
      const [row] = await tx
        .select({
          uncertain: sql<boolean>`coalesce(${outboundMessages.firstAttemptAt} <= ${queueSql(queueTime(now, -UNCERTAIN_AFTER_MS))}, false)`,
        })
        .from(outboundMessages)
        .where(eq(outboundMessages.id, id))
      return Boolean(row?.uncertain)
    },
    async erasePayloads(days: number, now: Date | undefined) {
      // Retention is explicitly enabled by configuration. Attachment pins remain permanent.
      return database()
        .update(outboundMessages)
        .set({ to: '', cc: [], subject: '', html: '', text: '', payloadErasedAt: queueSql(now) })
        .where(
          and(
            inArray(outboundMessages.status, ['sent', 'cancelled']),
            lte(outboundMessages.createdAt, queueSql(queueTime(now, -days * 86400_000))),
            sql`${outboundMessages.payloadErasedAt} is null`,
          ),
        )
        .returning({ id: outboundMessages.id })
    },
  }
}
