import { and, eq, isNull, lte, or, sql } from 'drizzle-orm'

import { permissions, rolePermissions, userRoles, users } from '../../../../db/schema/auth.js'
import { products } from '../../../../db/schema/catalog.js'
import { deliveryNotes } from '../../../../db/schema/delivery-notes.js'
import { estimates } from '../../../../db/schema/estimates.js'
import { invoices } from '../../../../db/schema/invoices.js'
import { mediaAssets } from '../../../../db/schema/media.js'
import { payments } from '../../../../db/schema/payments.js'
import { auditEvents, companySettings, documentTemplates } from '../../../../db/schema/settings.js'
import { PaymentReceiptSnapshotSchema } from '../../../contracts/generated/sales/payments.schemas.js'
import type { Database, Transaction } from '../../../lib/db.js'
import { AppError } from '../../../lib/errors.js'

export function createMediaRepository(database: () => Database) {
  return {
    transaction: <T>(work: (tx: Transaction) => Promise<T>) => database().transaction(work),
    async documentAppearance(
      type: 'invoice' | 'estimate' | 'delivery_note' | 'payment_receipt',
      id: string,
      version: number,
      tx: Transaction,
      design: 'saved' | 'latest' = 'saved',
    ) {
      if (type === 'delivery_note') {
        const [delivery] = await tx.select().from(deliveryNotes).where(eq(deliveryNotes.id, id))
        if (!delivery || delivery.contentVersion !== version || delivery.status === 'draft')
          throw new AppError(409, 'DOCUMENT_CHANGED', 'Document is not ready for rendering.')
        if (design === 'saved')
          return { layout: 'classic', accentColor: '#ad7d1d' } as Record<string, unknown>
      }
      let receipt
      if (type === 'payment_receipt') {
        const [payment] = await tx.select().from(payments).where(eq(payments.id, id))
        if (!payment || payment.version !== version)
          throw new AppError(409, 'DOCUMENT_CHANGED', 'Payment changed during rendering.')
        const saved = PaymentReceiptSnapshotSchema.parse(payment.receiptSnapshot)
        receipt = {
          appearance: saved.appearance,
          version,
          status: payment.status,
          templateId: saved.templateId,
        }
      }
      const table = type === 'invoice' ? invoices : estimates
      const [row] =
        type === 'payment_receipt'
          ? [receipt]
          : type === 'delivery_note'
            ? []
            : await tx
                .select({
                  appearance: table.appearanceSnapshot,
                  version: table.contentVersion,
                  status: table.status,
                  templateId: table.templateId,
                })
                .from(table)
                .where(eq(table.id, id))
      if (type !== 'delivery_note' && (!row || row.version !== version || row.status === 'draft'))
        throw new AppError(409, 'DOCUMENT_CHANGED', 'Document is not ready for rendering.')
      if (design === 'saved') return row!.appearance as Record<string, unknown>
      const [company] = await tx.select().from(companySettings).limit(1)
      const templateId = row?.templateId ?? company?.defaultTemplateId
      const [template] = templateId
        ? await tx.select().from(documentTemplates).where(eq(documentTemplates.id, templateId))
        : []
      if (!template || template.archivedAt)
        throw new AppError(
          409,
          'TEMPLATE_UNAVAILABLE',
          'The latest template is unavailable. Use the saved design.',
        )
      return {
        layout: template.layout,
        density: template.density,
        accentColor: template.accentColor,
        logoAssetId: template.logoAssetId ?? company?.logoAssetId,
        signatureAssetId: template.signatureAssetId,
        showSignature: template.showSignature,
        showBankDetails: template.showBankDetails,
        showPaymentTerms: template.showPaymentTerms,
        footerText: template.footerText,
      } as Record<string, unknown>
    },
    // Shared with settings/identity writes: serialize attachment, deletion and permission changes.
    lock: (tx: Transaction) => tx.execute(sql`select pg_advisory_xact_lock(73619001)`),
    async permissions(actor: string, tx: Transaction) {
      return (
        await tx
          .select({ key: permissions.key })
          .from(users)
          .innerJoin(userRoles, eq(users.id, userRoles.userId))
          .innerJoin(rolePermissions, eq(userRoles.roleId, rolePermissions.roleId))
          .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
          .where(
            and(
              eq(users.id, actor),
              isNull(users.disabledAt),
              isNull(users.archivedAt),
              eq(users.mustChangePassword, false),
            ),
          )
      ).map((row) => row.key)
    },
    async get(id: string, tx: Database | Transaction = database()) {
      const [row] = await tx.select().from(mediaAssets).where(eq(mediaAssets.id, id))
      if (!row) throw new AppError(404, 'MEDIA_NOT_FOUND', 'Media not found.')
      return row
    },
    async insert(data: typeof mediaAssets.$inferInsert, tx: Transaction) {
      const [row] = await tx.insert(mediaAssets).values(data).returning()
      return row!
    },
    async update(id: string, data: Partial<typeof mediaAssets.$inferInsert>, tx: Transaction) {
      const [row] = await tx
        .update(mediaAssets)
        .set({ ...data, version: sql`${mediaAssets.version} + 1`, updatedAt: new Date() })
        .where(eq(mediaAssets.id, id))
        .returning()
      return row!
    },
    async references(id: string, tx: Transaction) {
      const company = await tx
        .select({ id: companySettings.id })
        .from(companySettings)
        .where(eq(companySettings.logoAssetId, id))
        .limit(1)
      const templates = await tx
        .select({ id: documentTemplates.id })
        .from(documentTemplates)
        .where(
          or(eq(documentTemplates.logoAssetId, id), eq(documentTemplates.signatureAssetId, id)),
        )
        .limit(1)
      const catalog = await tx
        .select({ id: products.id })
        .from(products)
        .where(eq(products.imageAssetId, id))
        .limit(1)
      const documentRefs =
        await tx.execute(sql`select 1 from invoices where appearance_snapshot->>'logoAssetId' = ${id} or appearance_snapshot->>'signatureAssetId' = ${id}
        union all select 1 from estimates where appearance_snapshot->>'logoAssetId' = ${id} or appearance_snapshot->>'signatureAssetId' = ${id}
        union all select 1 from payments where receipt_snapshot->'appearance'->>'logoAssetId' = ${id} or receipt_snapshot->'appearance'->>'signatureAssetId' = ${id} limit 1`)
      return {
        company: company.length > 0,
        templates: templates.length > 0,
        products: catalog.length > 0,
        documents: documentRefs.length > 0,
      }
    },
    candidates: () =>
      database()
        .select({ id: mediaAssets.id })
        .from(mediaAssets)
        .where(
          or(
            eq(mediaAssets.status, 'deleting'),
            and(
              lte(mediaAssets.expiresAt, new Date()),
              or(eq(mediaAssets.status, 'pending'), eq(mediaAssets.status, 'ready')),
            ),
          ),
        )
        .orderBy(mediaAssets.updatedAt)
        .limit(100),
    audit: (tx: Transaction, actor: string | null, action: string, id: string) =>
      tx.insert(auditEvents).values({
        actorUserId: actor,
        actorKind: actor ? 'user' : 'system',
        action,
        entityTable: 'media_assets',
        entityKey: { id },
      }),
  }
}
