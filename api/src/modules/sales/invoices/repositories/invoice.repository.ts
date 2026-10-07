import { and, asc, desc, eq, gte, ilike, isNotNull, isNull, lte, or, sql } from 'drizzle-orm'

import { permissions, rolePermissions, userRoles, users } from '../../../../../db/schema/auth.js'
import { products, productVariants } from '../../../../../db/schema/catalog.js'
import { clients } from '../../../../../db/schema/clients.js'
import {
  deliveryInvoiceAllocations,
  deliveryNoteLines,
  deliveryNotes,
} from '../../../../../db/schema/delivery-notes.js'
import { estimateLines, estimates } from '../../../../../db/schema/estimates.js'
import { invoiceLines, invoices } from '../../../../../db/schema/invoices.js'
import {
  auditEvents,
  companySettings,
  documentTemplates,
} from '../../../../../db/schema/settings.js'
import type { ListInvoicesQuery } from '../../../../contracts/generated/sales/invoices.schemas.js'
import type { Database, Transaction } from '../../../../lib/db.js'
import { AppError } from '../../../../lib/errors.js'
import { companyDate } from '../../../../lib/validation.js'
import { paymentBalancesForInvoices } from '../../payments/repositories/payment.repository.js'

export type InvoiceRow = typeof invoices.$inferSelect
export type InvoiceLineRow = typeof invoiceLines.$inferSelect
type ListFilters = Omit<ListInvoicesQuery, 'page' | 'pageSize'>
const paidSql = sql<number>`coalesce((select sum(p.amount) from payments p where p.invoice_id = ${invoices.id} and p.status = 'confirmed'), 0)`
const outstandingSql = sql<number>`case when ${invoices.status} in ('issued','sent') then greatest(${invoices.total} - ${paidSql}, 0) else 0 end`
const clientNameSql = sql<string>`coalesce(${clients.legalName}, concat_ws(' ', ${clients.firstName}, ${clients.lastName}))`

export function createInvoiceRepository(database: () => Database) {
  return {
    transaction: <T>(work: (tx: Transaction) => Promise<T>) => database().transaction(work),
    async authorize(tx: Transaction, actor: string, permission: string) {
      await tx.execute(sql`select pg_advisory_xact_lock(73619001)`)
      const [row] = await tx
        .select({ id: users.id })
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
            eq(permissions.key, permission),
          ),
        )
        .limit(1)
      if (!row) throw new AppError(403, 'FORBIDDEN', 'Your permissions have changed.')
    },
    async one(id: string, tx: Database | Transaction = database(), lock = false) {
      const query = tx.select().from(invoices).where(eq(invoices.id, id))
      const [row] = lock ? await query.for('update') : await query
      if (!row) throw new AppError(404, 'INVOICE_NOT_FOUND', 'Invoice not found.')
      return row
    },
    lines(id: string, tx: Database | Transaction = database()) {
      return tx
        .select()
        .from(invoiceLines)
        .where(eq(invoiceLines.invoiceId, id))
        .orderBy(invoiceLines.position)
    },
    balances(ids: string[], tx: Database | Transaction = database()) {
      return paymentBalancesForInvoices(tx, ids)
    },
    async clientDisplayName(id: string, tx: Database | Transaction = database()) {
      const [row] = await tx.select({ name: clientNameSql }).from(clients).where(eq(clients.id, id))
      return row?.name ?? ''
    },
    async sourceEstimateNumber(id: string | null, tx: Database | Transaction = database()) {
      if (!id) return null
      const [row] = await tx
        .select({ number: estimates.number })
        .from(estimates)
        .where(eq(estimates.id, id))
      return row?.number ?? null
    },
    async relatedDeliveryNotes(id: string, tx: Database | Transaction = database()) {
      const ids = await this.relatedDeliveryNoteIds(id, tx)
      if (!ids.length) return []
      return tx
        .select({ id: deliveryNotes.id, number: deliveryNotes.number })
        .from(deliveryNotes)
        .where(
          sql`${deliveryNotes.id} in (${sql.join(
            ids.map((noteId) => sql`${noteId}`),
            sql`, `,
          )})`,
        )
    },
    async hasActivePayments(id: string, tx: Transaction) {
      const result = await tx.execute(
        sql`select 1 from payments where invoice_id = ${id} and status in ('pending', 'confirmed') limit 1`,
      )
      return result.length > 0
    },
    async relatedDeliveryNoteIds(id: string, tx: Database | Transaction = database()) {
      const [direct, allocated] = await Promise.all([
        tx
          .select({ id: deliveryNotes.id })
          .from(deliveryNotes)
          .where(eq(deliveryNotes.invoiceId, id)),
        tx
          .selectDistinct({ id: deliveryNotes.id })
          .from(deliveryInvoiceAllocations)
          .innerJoin(invoiceLines, eq(deliveryInvoiceAllocations.invoiceLineId, invoiceLines.id))
          .innerJoin(
            deliveryNoteLines,
            eq(deliveryInvoiceAllocations.deliveryNoteLineId, deliveryNoteLines.id),
          )
          .innerJoin(deliveryNotes, eq(deliveryNoteLines.deliveryNoteId, deliveryNotes.id))
          .where(eq(invoiceLines.invoiceId, id)),
      ])
      return [...new Set([...direct, ...allocated].map((row) => row.id))]
    },
    async hasActiveDeliveries(id: string, tx: Transaction) {
      const [row] = await tx
        .select({ id: deliveryNotes.id })
        .from(deliveryNotes)
        .where(and(eq(deliveryNotes.invoiceId, id), sql`${deliveryNotes.status} <> 'cancelled'`))
        .limit(1)
      return Boolean(row)
    },
    async hasAllocations(id: string, tx: Transaction) {
      const [row] = await tx
        .select({ id: deliveryInvoiceAllocations.deliveryNoteLineId })
        .from(deliveryInvoiceAllocations)
        .innerJoin(invoiceLines, eq(deliveryInvoiceAllocations.invoiceLineId, invoiceLines.id))
        .where(eq(invoiceLines.invoiceId, id))
        .limit(1)
      return Boolean(row)
    },
    async deliveryLine(id: string, tx: Transaction) {
      const [row] = await tx
        .select({ line: deliveryNoteLines, note: deliveryNotes })
        .from(deliveryNoteLines)
        .innerJoin(deliveryNotes, eq(deliveryNoteLines.deliveryNoteId, deliveryNotes.id))
        .where(eq(deliveryNoteLines.id, id))
        .for('update')
      if (!row || !['delivered', 'acknowledged'].includes(row.note.status) || row.note.invoiceId)
        throw new AppError(409, 'DELIVERY_NOT_BILLABLE', 'Select a delivered independent note.')
      return row
    },
    async allocatedQuantity(id: string, tx: Transaction) {
      const [row] = await tx
        .select({
          total: sql<number>`coalesce(sum(${deliveryInvoiceAllocations.quantity}),0)::int`,
        })
        .from(deliveryInvoiceAllocations)
        .where(eq(deliveryInvoiceAllocations.deliveryNoteLineId, id))
      return row?.total ?? 0
    },
    allocate(invoiceLineId: string, deliveryNoteLineId: string, quantity: number, tx: Transaction) {
      return tx
        .insert(deliveryInvoiceAllocations)
        .values({ invoiceLineId, deliveryNoteLineId, quantity })
    },
    async sourceEstimate(id: string, tx: Transaction) {
      const [row] = await tx.select().from(estimates).where(eq(estimates.id, id)).for('update')
      if (!row) throw new AppError(404, 'ESTIMATE_NOT_FOUND', 'Estimate not found.')
      return row
    },
    estimateLines(id: string, tx: Transaction) {
      return tx
        .select()
        .from(estimateLines)
        .where(eq(estimateLines.estimateId, id))
        .orderBy(estimateLines.position)
    },
    byOperation(id: string, tx: Transaction) {
      return tx
        .select()
        .from(invoices)
        .where(eq(invoices.conversionOperationId, id))
        .then((rows) => rows[0] ?? null)
    },
    linked(estimateId: string, tx: Database | Transaction = database()) {
      return tx
        .select()
        .from(invoices)
        .where(eq(invoices.sourceEstimateId, estimateId))
        .orderBy(invoices.createdAt)
    },
    async client(id: string, tx: Transaction) {
      const [row] = await tx.select().from(clients).where(eq(clients.id, id))
      if (!row || row.archivedAt)
        throw new AppError(400, 'INVALID_CLIENT', 'Select an active client.')
      return row
    },
    async company(tx: Transaction) {
      const [row] = await tx.select().from(companySettings).where(eq(companySettings.id, 1))
      if (!row?.legalName || !row.addressLine1 || !row.city)
        throw new AppError(
          409,
          'COMPANY_INCOMPLETE',
          'Complete company identity before creating documents.',
        )
      return row
    },
    async template(id: string | null, tx: Transaction) {
      if (!id) return null
      const [row] = await tx.select().from(documentTemplates).where(eq(documentTemplates.id, id))
      if (!row || row.archivedAt)
        throw new AppError(400, 'INVALID_TEMPLATE', 'Select an active template.')
      return row
    },
    async variant(id: string, tx: Transaction) {
      const [row] = await tx
        .select({ variant: productVariants, product: products })
        .from(productVariants)
        .innerJoin(products, eq(productVariants.productId, products.id))
        .where(eq(productVariants.id, id))
      if (!row || row.variant.archivedAt || row.product.archivedAt)
        throw new AppError(400, 'INVALID_VARIANT', 'Select an active product variant.')
      return row
    },
    insert(data: typeof invoices.$inferInsert, tx: Transaction) {
      return tx
        .insert(invoices)
        .values(data)
        .returning()
        .then((rows) => rows[0]!)
    },
    update(
      id: string,
      data: Partial<typeof invoices.$inferInsert>,
      tx: Transaction,
      printable = false,
    ) {
      return tx
        .update(invoices)
        .set({
          ...data,
          version: sql`${invoices.version} + 1`,
          ...(printable ? { contentVersion: sql`${invoices.contentVersion} + 1` } : {}),
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, id))
        .returning()
        .then((rows) => rows[0]!)
    },
    async replaceLines(id: string, lines: (typeof invoiceLines.$inferInsert)[], tx: Transaction) {
      await tx.delete(invoiceLines).where(eq(invoiceLines.invoiceId, id))
      if (lines.length) await tx.insert(invoiceLines).values(lines)
    },
    delete(id: string, tx: Transaction) {
      return tx.delete(invoices).where(eq(invoices.id, id))
    },
    async list(filters: ListFilters) {
      const term = filters.search?.trim().replace(/[\\%_]/g, '\\$&')
      const [company] = await database()
        .select({ timezone: companySettings.timezone })
        .from(companySettings)
        .where(eq(companySettings.id, 1))
      // Use the same IANA implementation as lifecycle validation, even if PostgreSQL
      // and Node were packaged with different timezone database versions.
      const today = sql`${companyDate(new Date(), company?.timezone)}::date`
      const where = and(
        filters.status === 'all' ? undefined : eq(invoices.status, filters.status),
        filters.clientId ? eq(invoices.clientId, filters.clientId) : undefined,
        term
          ? or(
              ilike(invoices.number, `%${term}%`),
              ilike(clientNameSql, `%${term}%`),
              ilike(clients.tradeName, `%${term}%`),
              ilike(clients.ice, `%${term}%`),
              ilike(clients.taxIdentifier, `%${term}%`),
              ilike(clients.registrationNumber, `%${term}%`),
            )
          : undefined,
        filters.dateFrom ? gte(invoices.issueDate, filters.dateFrom) : undefined,
        filters.dateTo ? lte(invoices.issueDate, filters.dateTo) : undefined,
        filters.amountMin ? gte(invoices.total, filters.amountMin) : undefined,
        filters.amountMax ? lte(invoices.total, filters.amountMax) : undefined,
        filters.source === 'estimate' ? isNotNull(invoices.sourceEstimateId) : undefined,
        filters.source === 'delivery'
          ? and(isNull(invoices.sourceEstimateId), isNotNull(invoices.conversionOperationId))
          : undefined,
        filters.source === 'direct'
          ? and(isNull(invoices.sourceEstimateId), isNull(invoices.conversionOperationId))
          : undefined,
        filters.paymentStatus === 'paid'
          ? sql`${invoices.status} in ('issued','sent') and ${paidSql} > 0 and ${paidSql} >= ${invoices.total}`
          : undefined,
        filters.paymentStatus === 'partial'
          ? sql`${invoices.status} in ('issued','sent') and ${paidSql} > 0 and ${paidSql} < ${invoices.total}`
          : undefined,
        filters.paymentStatus === 'unpaid'
          ? sql`${invoices.status} in ('issued','sent') and ${paidSql} = 0`
          : undefined,
        filters.overdue === true
          ? sql`${invoices.status} in ('issued','sent') and ${invoices.dueDate} < ${today} and ${outstandingSql} > 0`
          : undefined,
        filters.overdue === false
          ? sql`not (${invoices.status} in ('issued','sent') and ${invoices.dueDate} < ${today} and ${outstandingSql} > 0)`
          : undefined,
      )
      const sortColumns = {
        createdAt: invoices.createdAt,
        issueDate: invoices.issueDate,
        dueDate: invoices.dueDate,
        number: invoices.number,
        clientName: clientNameSql,
        total: invoices.total,
        outstandingAmount: outstandingSql,
      }
      const sort = sortColumns[filters.sortBy ?? 'createdAt']
      const direction = filters.sortOrder === 'asc' ? asc : desc
      const [items, count] = await Promise.all([
        database()
          .select()
          .from(invoices)
          .innerJoin(clients, eq(invoices.clientId, clients.id))
          .where(where)
          .orderBy(direction(sort), direction(invoices.id))
          .limit(filters.limit)
          .offset(filters.offset)
          .then((rows) => rows.map((row) => row.invoices)),
        database()
          .select({ total: sql<number>`count(*)::int` })
          .from(invoices)
          .innerJoin(clients, eq(invoices.clientId, clients.id))
          .where(where),
      ])
      return { items, total: count[0]?.total ?? 0 }
    },
    audit(
      tx: Transaction,
      actor: string,
      action: string,
      id: string,
      before: unknown,
      after: unknown,
    ) {
      return tx.insert(auditEvents).values({
        actorUserId: actor,
        actorKind: 'user',
        action,
        entityTable: 'invoices',
        entityKey: { id },
        beforeValues: before,
        afterValues: after,
      })
    },
  }
}
