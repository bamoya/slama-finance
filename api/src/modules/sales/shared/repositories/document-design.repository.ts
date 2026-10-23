import { eq, sql } from 'drizzle-orm'

import { deliveryNotes } from '../../../../../db/schema/delivery-notes.js'
import { estimates } from '../../../../../db/schema/estimates.js'
import { invoices } from '../../../../../db/schema/invoices.js'
import { mediaAssets } from '../../../../../db/schema/media.js'
import { payments } from '../../../../../db/schema/payments.js'
import { auditEvents, documentTemplates } from '../../../../../db/schema/settings.js'
import type { Transaction } from '../../../../lib/db.js'
import { AppError } from '../../../../lib/errors.js'

export interface RenderedDesign {
  templateId: string | null
  templateVersion: number | null
  appearance: Record<string, unknown>
}

/** Called in the same transaction as artifact replacement: failed renders never change the owner. */
export async function saveDocumentDesign(
  tx: Transaction,
  type: 'invoice' | 'estimate' | 'delivery_note' | 'payment_receipt',
  id: string,
  actor: string,
  design: RenderedDesign,
) {
  await tx.execute(sql`select pg_advisory_xact_lock(73619001)`)
  if (design.templateId) {
    const [template] = await tx
      .select()
      .from(documentTemplates)
      .where(eq(documentTemplates.id, design.templateId))
      .for('share')
    if (!template || template.archivedAt || template.version !== design.templateVersion)
      throw new AppError(
        409,
        'TEMPLATE_CHANGED',
        'The selected template changed. Reload and regenerate again.',
      )
  }
  for (const [key, purpose] of [
    ['logoAssetId', 'company_logo'],
    ['signatureAssetId', 'company_signature'],
  ] as const) {
    const assetId = design.appearance[key]
    if (!assetId) continue
    const [asset] = await tx
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, String(assetId)))
    if (!asset || asset.status !== 'ready' || asset.purpose !== purpose)
      throw new AppError(409, 'MEDIA_NOT_FOUND', 'Document image changed during regeneration.')
  }
  const table = type === 'invoice' ? invoices : type === 'estimate' ? estimates : deliveryNotes
  if (type === 'payment_receipt') {
    await tx
      .update(payments)
      .set({
        receiptSnapshot: sql`jsonb_set(jsonb_set(${payments.receiptSnapshot}, '{templateId}', ${JSON.stringify(design.templateId)}::jsonb), '{appearance}', ${JSON.stringify(design.appearance)}::jsonb)`,
        updatedAt: new Date(),
        updatedByUserId: actor,
      })
      .where(eq(payments.id, id))
  } else {
    await tx
      .update(table)
      .set({
        templateId: design.templateId,
        appearanceSnapshot: design.appearance,
        updatedAt: new Date(),
        updatedByUserId: actor,
      })
      .where(eq(table.id, id))
  }
  await tx.insert(auditEvents).values({
    actorUserId: actor,
    actorKind: 'user',
    entityTable:
      type === 'payment_receipt'
        ? 'payments'
        : type === 'delivery_note'
          ? 'delivery_notes'
          : `${type}s`,
    entityKey: { id },
    action: 'change_document_template',
    afterValues: { templateId: design.templateId, appearance: design.appearance },
  })
}
