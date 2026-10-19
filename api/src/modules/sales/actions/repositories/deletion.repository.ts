import { and, asc, eq, inArray, notInArray, or, sql } from 'drizzle-orm'

import { documentArtifacts } from '../../../../../db/schema/artifacts.js'
import { clients } from '../../../../../db/schema/clients.js'
import {
  deliveryInvoiceAllocations,
  deliveryNoteLines,
  deliveryNotes,
} from '../../../../../db/schema/delivery-notes.js'
import { estimates } from '../../../../../db/schema/estimates.js'
import { invoices } from '../../../../../db/schema/invoices.js'
import { backgroundJobs } from '../../../../../db/schema/jobs.js'
import {
  notificationDispatches,
  outboundMessageAttachments,
  outboundMessages,
} from '../../../../../db/schema/notifications.js'
import { payments } from '../../../../../db/schema/payments.js'
import { auditEvents } from '../../../../../db/schema/settings.js'
import type { SalesDeletionSelection } from '../../../../contracts/generated/sales/actions.schemas.js'
import type { Transaction } from '../../../../lib/db.js'

type Scope = { estimates: string[]; invoices: string[]; notes: string[] }
async function loadDeletionGraph(input: SalesDeletionSelection, tx: Transaction, scope?: Scope) {
  const ids = input.records.map((row) => row.id.toLowerCase()).sort()
  const removedEstimates =
    input.resource === 'estimates' || scope
      ? await tx
          .select()
          .from(estimates)
          .where(inArray(estimates.id, scope?.estimates ?? ids))
          .orderBy(asc(estimates.id))
          .for('update')
      : []
  const relatedInvoices = scope
    ? await tx
        .select()
        .from(invoices)
        .where(inArray(invoices.id, scope.invoices))
        .orderBy(asc(invoices.id))
        .for('update')
    : input.resource === 'estimates'
      ? await tx
          .select()
          .from(invoices)
          .where(inArray(invoices.sourceEstimateId, ids))
          .orderBy(asc(invoices.id))
          .for('update')
      : input.resource === 'invoices'
        ? await tx
            .select()
            .from(invoices)
            .where(inArray(invoices.id, ids))
            .orderBy(asc(invoices.id))
            .for('update')
        : []
  const removedInvoices =
    scope || input.resource === 'invoices' || input.cascadeInvoices ? relatedInvoices : []
  const detachedInvoices =
    scope && scope.estimates.length
      ? await tx
          .select()
          .from(invoices)
          .where(
            and(
              inArray(invoices.sourceEstimateId, scope.estimates),
              scope.invoices.length ? notInArray(invoices.id, scope.invoices) : undefined,
            ),
          )
          .orderBy(asc(invoices.id))
          .for('update')
      : input.resource === 'estimates' && !input.cascadeInvoices
        ? relatedInvoices
        : []
  const invoiceIds = removedInvoices.map((row) => row.id)
  const removedNotes =
    input.resource === 'delivery_notes' || scope
      ? await tx
          .select()
          .from(deliveryNotes)
          .where(inArray(deliveryNotes.id, scope?.notes ?? ids))
          .orderBy(asc(deliveryNotes.id))
          .for('update')
      : invoiceIds.length
        ? await tx
            .select()
            .from(deliveryNotes)
            .where(inArray(deliveryNotes.invoiceId, invoiceIds))
            .orderBy(asc(deliveryNotes.id))
            .for('update')
        : []
  const removedPayments =
    input.resource === 'payments'
      ? await tx
          .select()
          .from(payments)
          .where(inArray(payments.id, ids))
          .orderBy(asc(payments.id))
          .for('update')
      : invoiceIds.length
        ? await tx
            .select()
            .from(payments)
            .where(inArray(payments.invoiceId, invoiceIds))
            .orderBy(asc(payments.id))
            .for('update')
        : []
  const detachedEstimates = removedEstimates.length
    ? await tx
        .select()
        .from(estimates)
        .where(
          and(
            inArray(
              estimates.revisionOfId,
              removedEstimates.map((row) => row.id),
            ),
            notInArray(
              estimates.id,
              removedEstimates.map((row) => row.id),
            ),
          ),
        )
        .orderBy(asc(estimates.id))
        .for('update')
    : []
  const removed = {
    estimates: removedEstimates,
    invoices: removedInvoices,
    delivery_notes: removedNotes,
    payments: removedPayments,
  }
  const owners = [
    { type: 'estimate', artifactType: 'estimate', ids: removedEstimates.map((row) => row.id) },
    { type: 'invoice', artifactType: 'invoice', ids: invoiceIds },
    {
      type: 'delivery_note',
      artifactType: 'delivery_note',
      ids: removedNotes.map((row) => row.id),
    },
    { type: 'payment', artifactType: 'payment_receipt', ids: removedPayments.map((row) => row.id) },
  ].filter((owner) => owner.ids.length)
  const dispatches = await tx
    .select()
    .from(notificationDispatches)
    .where(
      or(
        ...owners.map((owner) =>
          and(
            eq(notificationDispatches.sourceType, owner.type),
            inArray(notificationDispatches.sourceId, owner.ids),
          ),
        ),
      ) ?? sql`false`,
    )
    .orderBy(asc(notificationDispatches.id))
  const messageIds = dispatches.map((row) => row.messageId)
  const messages = messageIds.length
    ? await tx
        .select()
        .from(outboundMessages)
        .where(inArray(outboundMessages.id, messageIds))
        .orderBy(asc(outboundMessages.id))
        .for('update')
    : []
  const jobs = await tx
    .select()
    .from(backgroundJobs)
    .where(
      or(
        ...owners.map((owner) =>
          or(
            and(
              eq(backgroundJobs.jobType, 'prepare_pdf'),
              sql`${backgroundJobs.payload}->>'documentType' = ${owner.artifactType}`,
              inArray(sql<string>`${backgroundJobs.payload}->>'documentId'`, owner.ids),
            ),
            and(
              eq(backgroundJobs.jobType, 'prepare_notification'),
              sql`${backgroundJobs.payload}->>'sourceType' = ${owner.type}`,
              inArray(sql<string>`${backgroundJobs.payload}->>'sourceId'`, owner.ids),
            ),
          ),
        ),
      ) ?? sql`false`,
    )
    .orderBy(asc(backgroundJobs.id))
    .for('update')
  const files = await tx
    .select()
    .from(documentArtifacts)
    .where(
      or(
        ...owners.map((owner) =>
          and(
            eq(documentArtifacts.documentType, owner.artifactType),
            inArray(documentArtifacts.documentId, owner.ids),
          ),
        ),
      ) ?? sql`false`,
    )
    .orderBy(asc(documentArtifacts.id))
  const attachments = messageIds.length
    ? await tx
        .select()
        .from(outboundMessageAttachments)
        .where(inArray(outboundMessageAttachments.messageId, messageIds))
        .orderBy(asc(outboundMessageAttachments.id))
    : []
  const keys = [...new Set([...files, ...attachments].map((row) => row.objectKey))].sort()
  for (const key of keys)
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 91036))`)
  const references = keys.length
    ? {
        files: await tx
          .select()
          .from(documentArtifacts)
          .where(
            and(
              inArray(documentArtifacts.objectKey, keys),
              files.length
                ? notInArray(
                    documentArtifacts.id,
                    files.map((row) => row.id),
                  )
                : undefined,
            ),
          )
          .orderBy(asc(documentArtifacts.id)),
        attachments: await tx
          .select()
          .from(outboundMessageAttachments)
          .where(
            and(
              inArray(outboundMessageAttachments.objectKey, keys),
              attachments.length
                ? notInArray(
                    outboundMessageAttachments.id,
                    attachments.map((row) => row.id),
                  )
                : undefined,
            ),
          )
          .orderBy(asc(outboundMessageAttachments.id)),
      }
    : { files: [], attachments: [] }
  return {
    removed,
    detachedInvoices,
    detachedEstimates,
    files,
    attachments,
    references,
    jobs,
    messages,
    dispatches,
  }
}

export function createDeletionRepository() {
  return {
    graph: loadDeletionGraph,
    async clientGraph(clientIds: string[], tx: Transaction, cascade = false) {
      const e = await tx
        .select({ id: estimates.id })
        .from(estimates)
        .where(inArray(estimates.clientId, clientIds))
      const i = await tx
        .select({ id: invoices.id })
        .from(invoices)
        .where(inArray(invoices.clientId, clientIds))
      const d = await tx
        .select({ id: deliveryNotes.id })
        .from(deliveryNotes)
        .where(
          or(
            inArray(deliveryNotes.clientId, clientIds),
            cascade && i.length
              ? inArray(
                  deliveryNotes.invoiceId,
                  i.map((row) => row.id),
                )
              : undefined,
          ),
        )
      return loadDeletionGraph({ resource: 'invoices', cascadeInvoices: true, records: [] }, tx, {
        estimates: e.map((row) => row.id),
        invoices: i.map((row) => row.id),
        notes: d.map((row) => row.id),
      })
    },
    clientRows(ids: string[], tx: Transaction) {
      return tx.select().from(clients).where(inArray(clients.id, ids)).orderBy(asc(clients.id))
    },
    async detachClients(
      state: Awaited<ReturnType<typeof loadDeletionGraph>>,
      snapshots: Map<string, unknown>,
      actor: string,
      tx: Transaction,
    ) {
      for (const [table, schema, rows] of [
        ['estimates', estimates, state.removed.estimates],
        ['invoices', invoices, state.removed.invoices],
        ['delivery_notes', deliveryNotes, state.removed.delivery_notes],
      ] as const) {
        for (const before of rows) {
          const [after] = await tx
            .update(schema)
            .set({
              clientId: null,
              ...(before.status === 'draft'
                ? {
                    clientSnapshot: snapshots.get(before.clientId!),
                    contentVersion: sql`${schema.contentVersion} + 1`,
                  }
                : {}),
              version: sql`${schema.version} + 1`,
              updatedAt: new Date(),
              updatedByUserId: actor,
            })
            .where(eq(schema.id, before.id))
            .returning()
          await tx.insert(auditEvents).values({
            actorKind: 'user',
            actorUserId: actor,
            action: 'detach_client',
            entityTable: table,
            entityKey: { id: before.id },
            beforeValues: { clientId: before.clientId },
            afterValues: { clientId: null, version: after!.version },
          })
        }
      }
      const jobs = state.jobs.filter((row) => row.jobType === 'prepare_notification')
      if (jobs.length)
        await tx
          .update(backgroundJobs)
          .set({
            status: 'cancelled',
            payload: {},
            leaseToken: null,
            lockedUntil: null,
            finishedAt: new Date(),
            lastErrorCode: 'CLIENT_DELETED',
          })
          .where(
            inArray(
              backgroundJobs.id,
              jobs.map((row) => row.id),
            ),
          )
      if (state.attachments.length)
        await tx.delete(outboundMessageAttachments).where(
          inArray(
            outboundMessageAttachments.id,
            state.attachments.map((row) => row.id),
          ),
        )
      if (state.dispatches.length)
        await tx.delete(notificationDispatches).where(
          inArray(
            notificationDispatches.id,
            state.dispatches.map((row) => row.id),
          ),
        )
      if (state.messages.length)
        await tx.delete(outboundMessages).where(
          inArray(
            outboundMessages.id,
            state.messages.map((row) => row.id),
          ),
        )
    },
    async remove(
      state: Awaited<ReturnType<typeof loadDeletionGraph>>,
      actor: string,
      tx: Transaction,
    ) {
      const { removed } = state
      const audit = async (
        table: string,
        action: string,
        before: { id: string },
        after: unknown = null,
      ) => {
        await tx.insert(auditEvents).values({
          actorKind: 'user',
          actorUserId: actor,
          action,
          entityTable: table,
          entityKey: { id: before.id },
          beforeValues: before,
          afterValues: after,
        })
      }
      for (const before of state.detachedInvoices) {
        const number =
          removed.estimates.find((row) => row.id === before.sourceEstimateId)?.number ??
          before.sourceEstimateNumberSnapshot
        const [after] = await tx
          .update(invoices)
          .set({
            sourceEstimateId: null,
            sourceEstimateNumberSnapshot: number,
            version: sql`${invoices.version} + 1`,
            updatedAt: new Date(),
            updatedByUserId: actor,
          })
          .where(eq(invoices.id, before.id))
          .returning()
        await audit('invoices', 'detach_source_estimate', before, after)
      }
      for (const before of state.detachedEstimates) {
        const [after] = await tx
          .update(estimates)
          .set({
            revisionOfId: null,
            version: sql`${estimates.version} + 1`,
            updatedAt: new Date(),
            updatedByUserId: actor,
          })
          .where(eq(estimates.id, before.id))
          .returning()
        await audit('estimates', 'detach_revision', before, after)
      }
      if (state.jobs.length)
        await tx
          .update(backgroundJobs)
          .set({
            status: 'cancelled',
            payload: {},
            leaseToken: null,
            lockedUntil: null,
            finishedAt: new Date(),
            lastErrorCode: 'OWNER_DELETED',
          })
          .where(
            inArray(
              backgroundJobs.id,
              state.jobs.map((row) => row.id),
            ),
          )
      if (state.attachments.length)
        await tx.delete(outboundMessageAttachments).where(
          inArray(
            outboundMessageAttachments.id,
            state.attachments.map((row) => row.id),
          ),
        )
      if (state.dispatches.length)
        await tx.delete(notificationDispatches).where(
          inArray(
            notificationDispatches.id,
            state.dispatches.map((row) => row.id),
          ),
        )
      if (state.messages.length)
        await tx.delete(outboundMessages).where(
          inArray(
            outboundMessages.id,
            state.messages.map((row) => row.id),
          ),
        )
      if (state.files.length)
        await tx.delete(documentArtifacts).where(
          inArray(
            documentArtifacts.id,
            state.files.map((row) => row.id),
          ),
        )
      for (const [table, records] of Object.entries(removed))
        for (const row of records) await audit(table, 'delete', row)
      if (removed.delivery_notes.length) {
        const noteIds = removed.delivery_notes.map((row) => row.id)
        await tx
          .delete(deliveryInvoiceAllocations)
          .where(
            inArray(
              deliveryInvoiceAllocations.deliveryNoteLineId,
              tx
                .select({ id: deliveryNoteLines.id })
                .from(deliveryNoteLines)
                .where(inArray(deliveryNoteLines.deliveryNoteId, noteIds)),
            ),
          )
        await tx.delete(deliveryNotes).where(inArray(deliveryNotes.id, noteIds))
      }
      if (removed.payments.length)
        await tx.delete(payments).where(
          inArray(
            payments.id,
            removed.payments.map((row) => row.id),
          ),
        )
      if (removed.invoices.length)
        await tx.delete(invoices).where(
          inArray(
            invoices.id,
            removed.invoices.map((row) => row.id),
          ),
        )
      if (removed.estimates.length) {
        const ids = removed.estimates.map((row) => row.id)
        await tx.update(estimates).set({ revisionOfId: null }).where(inArray(estimates.id, ids))
        await tx.delete(estimates).where(inArray(estimates.id, ids))
      }
    },
  }
}
