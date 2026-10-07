import { and, eq, inArray, sql } from 'drizzle-orm'

import { documentArtifacts } from '../../../../../db/schema/artifacts.js'
import {
  notificationDispatches,
  outboundMessageAttachments,
  outboundMessages,
} from '../../../../../db/schema/notifications.js'
import { reportRuns } from '../../../../../db/schema/reporting.js'
import type { Database, Transaction } from '../../../../lib/db.js'
import { AppError } from '../../../../lib/errors.js'
import { createScheduleRepository } from './schedule.repository.js'

export function createRunManagementRepository(database: () => Database) {
  return {
    ...createScheduleRepository(database),
    runsForDeletion(id: string, tx: Transaction) {
      return tx
        .select()
        .from(reportRuns)
        .where(eq(reportRuns.scheduleId, id))
        .orderBy(reportRuns.id)
        .for('update')
    },
    async release(id: string, removeRun: boolean, tx: Transaction) {
      // Same message row lock as the delivery worker. Never remove an in-flight attachment.
      const messages = await tx
        .select({ id: outboundMessages.id, status: outboundMessages.status })
        .from(notificationDispatches)
        .innerJoin(outboundMessages, eq(outboundMessages.id, notificationDispatches.messageId))
        .where(
          and(
            eq(notificationDispatches.sourceType, 'report_run'),
            eq(notificationDispatches.sourceId, id),
          ),
        )
        .orderBy(outboundMessages.id)
        .for('update', { of: outboundMessages })
      if (messages.some((message) => ['queued', 'sending'].includes(message.status)))
        throw new AppError(
          409,
          'REPORT_DELIVERY_ACTIVE',
          'Wait for email delivery before cleaning up this run.',
        )
      const files = await tx
        .select()
        .from(documentArtifacts)
        .where(
          and(
            eq(documentArtifacts.documentType, 'report_run'),
            eq(documentArtifacts.documentId, id),
          ),
        )
      const ids = messages.map((message) => message.id)
      const attachments = ids.length
        ? await tx
            .select()
            .from(outboundMessageAttachments)
            .where(inArray(outboundMessageAttachments.messageId, ids))
        : []
      const objects = new Map(
        [...files, ...attachments].map((file) => [
          file.objectKey,
          { objectKey: file.objectKey, byteSize: file.byteSize },
        ]),
      )
      for (const key of [...objects.keys()].sort())
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 91036))`)
      if (ids.length)
        await tx
          .delete(outboundMessageAttachments)
          .where(inArray(outboundMessageAttachments.messageId, ids))
      await tx
        .delete(documentArtifacts)
        .where(
          and(
            eq(documentArtifacts.documentType, 'report_run'),
            eq(documentArtifacts.documentId, id),
          ),
        )
      if (removeRun) {
        await tx
          .delete(notificationDispatches)
          .where(
            and(
              eq(notificationDispatches.sourceType, 'report_run'),
              eq(notificationDispatches.sourceId, id),
            ),
          )
        if (ids.length) await tx.delete(outboundMessages).where(inArray(outboundMessages.id, ids))
        await tx.delete(reportRuns).where(eq(reportRuns.id, id))
      }
      return [...objects.values()]
    },
  }
}
