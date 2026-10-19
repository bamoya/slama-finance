import { asc, inArray, sql } from 'drizzle-orm'

import { deliveryNoteLines, deliveryNotes } from '../../../../../db/schema/delivery-notes.js'
import { estimateLines, estimates } from '../../../../../db/schema/estimates.js'
import { invoiceLines, invoices } from '../../../../../db/schema/invoices.js'
import { auditEvents } from '../../../../../db/schema/settings.js'
import type { Transaction } from '../../../../lib/db.js'

export function createCatalogReferenceRepository() {
  return {
    async graph(tx: Transaction, productIds: string[]) {
      const eLines = productIds.length
        ? await tx
            .select()
            .from(estimateLines)
            .where(inArray(estimateLines.productId, productIds))
            .orderBy(asc(estimateLines.id))
        : []
      const iLines = productIds.length
        ? await tx
            .select()
            .from(invoiceLines)
            .where(inArray(invoiceLines.productId, productIds))
            .orderBy(asc(invoiceLines.id))
        : []
      const dLines = productIds.length
        ? await tx
            .select()
            .from(deliveryNoteLines)
            .where(inArray(deliveryNoteLines.productId, productIds))
            .orderBy(asc(deliveryNoteLines.id))
        : []
      const eIds = [...new Set(eLines.map((row) => row.estimateId))]
      const iIds = [...new Set(iLines.map((row) => row.invoiceId))]
      const dIds = [...new Set(dLines.map((row) => row.deliveryNoteId))]
      return {
        eLines,
        iLines,
        dLines,
        estimates: eIds.length
          ? await tx
              .select()
              .from(estimates)
              .where(inArray(estimates.id, eIds))
              .orderBy(asc(estimates.id))
              .for('update')
          : [],
        invoices: iIds.length
          ? await tx
              .select()
              .from(invoices)
              .where(inArray(invoices.id, iIds))
              .orderBy(asc(invoices.id))
              .for('update')
          : [],
        delivery_notes: dIds.length
          ? await tx
              .select()
              .from(deliveryNotes)
              .where(inArray(deliveryNotes.id, dIds))
              .orderBy(asc(deliveryNotes.id))
              .for('update')
          : [],
      }
    },
    async detach(tx: Transaction, productIds: string[], actor: string) {
      if (!productIds.length) return
      // Change only live catalogue references. Printable snapshots stay byte-for-byte intact.
      const e = await tx
        .update(estimateLines)
        .set({ productId: null, productVariantId: null })
        .where(inArray(estimateLines.productId, productIds))
        .returning({ id: estimateLines.estimateId })
      const i = await tx
        .update(invoiceLines)
        .set({ productId: null, productVariantId: null })
        .where(inArray(invoiceLines.productId, productIds))
        .returning({ id: invoiceLines.invoiceId })
      const d = await tx
        .update(deliveryNoteLines)
        .set({ productId: null, productVariantId: null })
        .where(inArray(deliveryNoteLines.productId, productIds))
        .returning({ id: deliveryNoteLines.deliveryNoteId })
      for (const [table, schema, ids] of [
        ['estimates', estimates, e.map((row) => row.id)],
        ['invoices', invoices, i.map((row) => row.id)],
        ['delivery_notes', deliveryNotes, d.map((row) => row.id)],
      ] as const) {
        const unique = [...new Set(ids)]
        if (!unique.length) continue
        await tx
          .update(schema)
          .set({
            version: sql`${schema.version} + 1`,
            updatedAt: new Date(),
            updatedByUserId: actor,
          })
          .where(inArray(schema.id, unique))
        await tx.insert(auditEvents).values(
          unique.map((id) => ({
            actorUserId: actor,
            actorKind: 'user',
            action: 'detach_catalog_references',
            entityTable: table,
            entityKey: { id },
            beforeValues: { productIds },
            afterValues: { productId: null, productVariantId: null },
          })),
        )
      }
    },
  }
}
