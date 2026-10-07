import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm'

import { documentArtifacts } from '../../../../../db/schema/artifacts.js'
import { estimates } from '../../../../../db/schema/estimates.js'
import { invoices } from '../../../../../db/schema/invoices.js'
import { backgroundJobs } from '../../../../../db/schema/jobs.js'
import { notificationDispatches, outboundMessages } from '../../../../../db/schema/notifications.js'
import { payments } from '../../../../../db/schema/payments.js'
import { auditEvents, companySettings } from '../../../../../db/schema/settings.js'
import type { Database, Transaction } from '../../../../lib/db.js'
import { AppError } from '../../../../lib/errors.js'
import { createEstimateRepository } from '../../estimates/repositories/estimate.repository.js'
import { createInvoiceRepository } from '../../invoices/repositories/invoice.repository.js'

export function createSalesNotificationRepository(database: () => Database) {
  const estimate = createEstimateRepository(database)
  const invoice = createInvoiceRepository(database)
  return {
    transaction: estimate.transaction,
    authorize: estimate.authorize,
    owner(
      type: 'invoice' | 'estimate',
      id: string,
      tx: Database | Transaction = database(),
      lock = false,
    ) {
      return type === 'invoice' ? invoice.one(id, tx, lock) : estimate.one(id, tx, lock)
    },
    async keyJob(key: string, tx: Transaction) {
      const [row] = await tx
        .select()
        .from(backgroundJobs)
        .where(eq(backgroundJobs.idempotencyKey, key))
      return row ?? null
    },
    async job(id: string, tx: Transaction) {
      const [row] = await tx
        .select()
        .from(backgroundJobs)
        .where(and(eq(backgroundJobs.id, id), eq(backgroundJobs.jobType, 'prepare_notification')))
        .for('update')
      if (!row)
        throw new AppError(404, 'PREPARATION_NOT_FOUND', 'Notification preparation not found.')
      return row
    },
    async dispatch(type: string, id: string, dispatchId: string, tx: Transaction) {
      const [row] = await tx
        .select()
        .from(notificationDispatches)
        .where(
          and(
            eq(notificationDispatches.id, dispatchId),
            eq(notificationDispatches.sourceType, type),
            eq(notificationDispatches.sourceId, id),
          ),
        )
      if (!row)
        throw new AppError(
          404,
          'DISPATCH_NOT_FOUND',
          'Notification dispatch not found for this owner.',
        )
      return row
    },
    async pinCurrentArtifact(
      type: string,
      id: string,
      version: number,
      key: string,
      tx: Transaction,
    ) {
      // Lock before checking the current artifact: regeneration and deletion share this protocol.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 91036))`)
      const [row] = await tx
        .select()
        .from(documentArtifacts)
        .where(
          and(
            eq(documentArtifacts.documentType, type),
            eq(documentArtifacts.documentId, id),
            eq(documentArtifacts.sourceVersion, version),
            eq(documentArtifacts.objectKey, key),
          ),
        )
      if (!row)
        throw new AppError(
          409,
          'ARTIFACT_CHANGED',
          'The prepared document file changed. Retry preparation.',
        )
      return row
    },
    async artifact(type: string, id: string, version: number) {
      const [row] = await database()
        .select()
        .from(documentArtifacts)
        .where(
          and(
            eq(documentArtifacts.documentType, type),
            eq(documentArtifacts.documentId, id),
            eq(documentArtifacts.sourceVersion, version),
            eq(documentArtifacts.format, 'pdf'),
          ),
        )
      return row ?? null
    },
    async insertDispatch(input: typeof notificationDispatches.$inferInsert, tx: Transaction) {
      return tx.insert(notificationDispatches).values(input).onConflictDoNothing().returning()
    },
    async timeline(type: string, id: string, limit: number, offset: number, tx: Transaction) {
      const scope = sql`(
        select j.id, 'preparation' as kind, j.status, j.created_at, j.attempts, j.last_error_code as error_code, j.payload->>'recipient' as recipient, j.payload->>'eventKey' as event_key
        from background_jobs j where j.job_type='prepare_notification' and j.payload->>'sourceType'=${type} and j.payload->>'sourceId'=${id}
        union all
        select d.id, 'dispatch' as kind, m.status, d.created_at, m.attempts, m.last_error_code, m.to_address, d.event_key
        from notification_dispatches d join outbound_messages m on m.id=d.message_id where d.source_type=${type} and d.source_id=${id}
      )`
      const items = await tx.execute<{
        id: string
        kind: 'preparation' | 'dispatch'
        status: string
        created_at: Date
        attempts: number
        error_code: string | null
        recipient: string | null
        event_key: string
      }>(
        sql`select * from ${scope} history order by created_at desc,id desc limit ${limit} offset ${offset}`,
      )
      const [count] = await tx.execute<{ total: number }>(
        sql`select count(*)::int as total from ${scope} history`,
      )
      return {
        items: items.map((r) => ({
          id: r.id,
          kind: r.kind,
          status: r.status,
          createdAt: new Date(r.created_at).toISOString(),
          attempts: r.attempts,
          errorCode: r.error_code,
          recipient: r.recipient,
          eventKey: r.event_key,
        })),
        total: count?.total ?? 0,
        limit,
        offset,
      }
    },
    async readyDispatches(tx: Transaction, filters: { event?: string; clientId?: string } = {}) {
      const rows = await tx.execute<{
        id: string
        message_id: string
        source_type: 'invoice' | 'estimate' | 'payment'
        source_id: string
        event_key: string
        recipient: string
        cc: string[]
        actor: string | null
      }>(sql`
        select d.id,d.message_id,d.source_type,d.source_id,d.event_key,m.to_address as recipient,m.cc,d.created_by_user_id as actor
        from notification_dispatches d join outbound_messages m on m.id=d.message_id
        left join invoices i on d.source_type='invoice' and i.id=d.source_id
        left join estimates e on d.source_type='estimate' and e.id=d.source_id
        left join payments p on d.source_type='payment' and p.id=d.source_id
        left join invoices pi on pi.id=p.invoice_id
        where m.status='queued' and d.source_type in ('invoice','estimate','payment')
        ${filters.event ? sql`and d.event_key=${filters.event}` : sql``}
        ${filters.clientId ? sql`and coalesce(i.client_id,e.client_id,pi.client_id)=${filters.clientId}::uuid` : sql``}
        order by d.created_at for update of m`)
      return rows
    },
    async queuedPreparations(tx: Transaction) {
      return tx
        .select()
        .from(backgroundJobs)
        .where(
          and(
            eq(backgroundJobs.jobType, 'prepare_notification'),
            eq(backgroundJobs.status, 'queued'),
          ),
        )
    },
    async reconcile(tx: Transaction) {
      const rows = await tx
        .select({ dispatch: notificationDispatches, message: outboundMessages })
        .from(notificationDispatches)
        .innerJoin(outboundMessages, eq(notificationDispatches.messageId, outboundMessages.id))
        .where(
          and(
            inArray(notificationDispatches.sourceType, ['invoice', 'estimate']),
            inArray(notificationDispatches.eventKey, ['invoice_sent', 'estimate_sent']),
            eq(outboundMessages.status, 'sent'),
            isNull(notificationDispatches.reconciledAt),
          ),
        )
        .limit(100)
        .for('update', { of: notificationDispatches, skipLocked: true })
      for (const { dispatch: d, message: m } of rows) {
        const type = d.sourceType as 'invoice' | 'estimate'
        const row = await this.owner(type, d.sourceId, tx, true)
        if (
          (type === 'invoice' ? ['issued', 'sent'] : ['issued', 'sent', 'accepted']).includes(
            row.status,
          ) &&
          !row.sentAt
        ) {
          const table = type === 'invoice' ? invoices : estimates
          await tx
            .update(table)
            .set({
              status: row.status === 'issued' ? 'sent' : row.status,
              sentAt: m.sentAt,
              version: sql`${table.version}+1`,
              updatedAt: new Date(),
            })
            .where(eq(table.id, row.id))
          await this.audit(tx, d.createdByUserId, 'send_accepted', row.id, null, {
            messageId: m.id,
            acceptedAt: m.sentAt,
          })
        }
        await tx
          .update(notificationDispatches)
          .set({ reconciledAt: new Date() })
          .where(eq(notificationDispatches.id, d.id))
      }
      return rows.length
    },
    async automaticCandidates(
      tx: Transaction,
      cursor: { invoice?: string; estimate?: string } = {},
    ) {
      await tx.execute(sql`select pg_advisory_xact_lock(73619001)`)
      const invoiceRows = await tx
        .select()
        .from(invoices)
        .where(
          and(
            cursor.invoice ? gt(invoices.id, cursor.invoice) : undefined,
            inArray(invoices.status, ['issued', 'sent']),
            sql`${invoices.total} > coalesce((select sum(p.amount) from payments p where p.invoice_id=${invoices.id} and p.status='confirmed'),0)`,
          ),
        )
        .orderBy(invoices.id)
        .limit(200)
      const estimateRows = await tx
        .select()
        .from(estimates)
        .where(
          and(
            cursor.estimate ? gt(estimates.id, cursor.estimate) : undefined,
            inArray(estimates.status, ['issued', 'sent']),
          ),
        )
        .orderBy(estimates.id)
        .limit(200)
      return { invoiceRows, estimateRows }
    },
    async outstanding(id: string, tx: Transaction) {
      const [row] = await tx.execute<{ amount: string }>(
        sql`select (i.total-coalesce((select sum(p.amount) from payments p where p.invoice_id=i.id and p.status='confirmed'),0))::text as amount from invoices i where i.id=${id}::uuid`,
      )
      return row?.amount ?? '0'
    },
    async occurrenceExists(type: string, id: string, event: string, key: string, tx: Transaction) {
      const [row] = await tx
        .select({ id: notificationDispatches.id })
        .from(notificationDispatches)
        .where(
          and(
            eq(notificationDispatches.sourceType, type),
            eq(notificationDispatches.sourceId, id),
            eq(notificationDispatches.eventKey, event),
            eq(notificationDispatches.logicalOccurrenceKey, key),
          ),
        )
      return !!row
    },
    async payment(id: string, tx: Transaction) {
      const [row] = await tx.select().from(payments).where(eq(payments.id, id)).for('update')
      if (!row) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment not found.')
      return row
    },
    async companyTimezone(tx: Transaction) {
      const [row] = await tx
        .select({ timezone: companySettings.timezone })
        .from(companySettings)
        .where(eq(companySettings.id, 1))
      return row?.timezone ?? 'Africa/Casablanca'
    },
    async expiry(date: string, now: Date, tx: Transaction) {
      const rows = await tx
        .select()
        .from(estimates)
        .where(
          and(
            inArray(estimates.status, ['issued', 'sent']),
            sql`${estimates.validUntil} < ${date}::date`,
          ),
        )
        .limit(100)
        .for('update', { skipLocked: true })
      for (const row of rows) {
        await tx
          .update(estimates)
          .set({
            status: 'expired',
            expiredAt: now,
            version: sql`${estimates.version}+1`,
            updatedAt: now,
          })
          .where(and(eq(estimates.id, row.id), inArray(estimates.status, ['issued', 'sent'])))
        await this.audit(
          tx,
          null,
          'expire',
          row.id,
          { status: row.status },
          { status: 'expired', expiredAt: now },
        )
      }
      return rows.length
    },
    async audit(
      tx: Transaction,
      actor: string | null,
      action: string,
      id: string,
      before: unknown,
      after: unknown,
    ) {
      await tx.insert(auditEvents).values({
        actorUserId: actor,
        actorKind: actor ? 'user' : 'system',
        action,
        entityTable: 'notification_dispatches',
        entityKey: { sourceId: id },
        beforeValues: before,
        afterValues: after,
      })
    },
  }
}
