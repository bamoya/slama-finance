import { and, eq, gt, inArray, isNotNull, lte, or, sql } from 'drizzle-orm'

import {
  outboundMessageAttachments,
  outboundMessages,
} from '../../../../db/schema/notifications.js'
import type { Database, Transaction } from '../../../lib/db.js'
import { AppError } from '../../../lib/errors.js'
import type { ComposedMessage } from '../types/notification.types.js'

export type OutboundMessage = typeof outboundMessages.$inferSelect

// The same keyed lock protects artifact publication, attachment pins and deletion.
export async function lockStorageReference(tx: Transaction, key: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 91036))`)
}

export function createNotificationRepository(database: () => Database) {
  return {
    async metrics(now: Date) {
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
        coalesce(greatest(0,extract(epoch from (${now.toISOString()}::timestamptz-min(available_at) filter(where status='queued' and available_at<=${now.toISOString()}::timestamptz)))),0)::float8 as "oldestEligibleAgeSeconds"
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
          createdByUserId: payload.actor,
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
    async claim(now: Date, token: string, tx: Transaction) {
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
            lte(outboundMessages.lockedUntil, now),
            or(
              eq(outboundMessages.attempts, outboundMessages.maxAttempts),
              lte(outboundMessages.firstAttemptAt, new Date(now.getTime() - 23 * 3600_000)),
            ),
          ),
        )
      const [row] = await tx
        .select()
        .from(outboundMessages)
        .where(
          and(
            lte(outboundMessages.availableAt, now),
            gt(outboundMessages.maxAttempts, outboundMessages.attempts),
            or(
              eq(outboundMessages.status, 'queued'),
              and(
                eq(outboundMessages.status, 'sending'),
                isNotNull(outboundMessages.lockedUntil),
                lte(outboundMessages.lockedUntil, now),
              ),
            ),
          ),
        )
        .orderBy(outboundMessages.availableAt, outboundMessages.createdAt)
        .limit(1)
        .for('update', { skipLocked: true })
      if (!row) return null
      if (row.firstAttemptAt && now.getTime() - row.firstAttemptAt.getTime() >= 23 * 3600_000) {
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
          lockedUntil: new Date(now.getTime() + 30_000),
          firstAttemptAt: row.firstAttemptAt ?? now,
        })
        .where(eq(outboundMessages.id, row.id))
        .returning()
      return claimed!
    },
    async fence(
      row: OutboundMessage,
      now: Date,
      changes: Partial<typeof outboundMessages.$inferInsert>,
      tx: Transaction,
    ) {
      const [updated] = await tx
        .update(outboundMessages)
        .set(changes)
        .where(
          and(
            eq(outboundMessages.id, row.id),
            eq(outboundMessages.status, 'sending'),
            eq(outboundMessages.leaseToken, row.leaseToken!),
            gt(outboundMessages.lockedUntil, now),
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
      changes: Partial<typeof outboundMessages.$inferInsert>,
      tx: Transaction,
    ) {
      const [row] = await tx
        .update(outboundMessages)
        .set(changes)
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
    async erasePayloads(before: Date, now: Date) {
      // Retention is explicitly enabled by configuration. Attachment pins remain permanent.
      return database()
        .update(outboundMessages)
        .set({ to: '', cc: [], subject: '', html: '', text: '', payloadErasedAt: now })
        .where(
          and(
            inArray(outboundMessages.status, ['sent', 'cancelled']),
            lte(outboundMessages.createdAt, before),
            sql`${outboundMessages.payloadErasedAt} is null`,
          ),
        )
        .returning({ id: outboundMessages.id })
    },
  }
}
