import { and, asc, desc, eq, gte, ilike, isNotNull, isNull, lte, ne, or, sql } from 'drizzle-orm'

import { permissions, rolePermissions, userRoles, users } from '../../../../../db/schema/auth.js'
import { products, productVariants } from '../../../../../db/schema/catalog.js'
import { clients } from '../../../../../db/schema/clients.js'
import {
  deliveryInvoiceAllocations,
  deliveryNoteLines,
  deliveryNotes,
} from '../../../../../db/schema/delivery-notes.js'
import { invoiceLines, invoices } from '../../../../../db/schema/invoices.js'
import { auditEvents, companySettings } from '../../../../../db/schema/settings.js'
import type { ListDeliveryNotesQuery } from '../../../../contracts/generated/sales/delivery-notes.schemas.js'
import type { Database, Transaction } from '../../../../lib/db.js'
import { AppError } from '../../../../lib/errors.js'

export type DeliveryNoteRow = typeof deliveryNotes.$inferSelect
export type DeliveryLineRow = typeof deliveryNoteLines.$inferSelect
type ListFilters = Omit<ListDeliveryNotesQuery, 'page' | 'pageSize'>
const clientNameSql = sql<string>`coalesce(${clients.legalName}, concat_ws(' ', ${clients.firstName}, ${clients.lastName}))`

export function createDeliveryNoteRepository(database: () => Database) {
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
      const query = tx.select().from(deliveryNotes).where(eq(deliveryNotes.id, id))
      const [row] = lock ? await query.for('update') : await query
      if (!row) throw new AppError(404, 'DELIVERY_NOTE_NOT_FOUND', 'Delivery note not found.')
      return row
    },
    lines(id: string, tx: Database | Transaction = database()) {
      return tx
        .select()
        .from(deliveryNoteLines)
        .where(eq(deliveryNoteLines.deliveryNoteId, id))
        .orderBy(deliveryNoteLines.position)
    },
    async clientDisplayName(id: string, tx: Database | Transaction = database()) {
      const [row] = await tx.select({ name: clientNameSql }).from(clients).where(eq(clients.id, id))
      return row?.name ?? ''
    },
    async invoiceNumber(id: string | null, tx: Database | Transaction = database()) {
      if (!id) return null
      const [row] = await tx
        .select({ number: invoices.number })
        .from(invoices)
        .where(eq(invoices.id, id))
      return row?.number ?? null
    },
    async relatedInvoices(
      noteId: string,
      directInvoiceId: string | null,
      tx: Database | Transaction = database(),
    ) {
      const columns = { id: invoices.id, number: invoices.number, status: invoices.status }
      const [direct, allocated] = await Promise.all([
        directInvoiceId
          ? tx.select(columns).from(invoices).where(eq(invoices.id, directInvoiceId))
          : Promise.resolve([]),
        tx
          .selectDistinct(columns)
          .from(deliveryNoteLines)
          .innerJoin(
            deliveryInvoiceAllocations,
            eq(deliveryNoteLines.id, deliveryInvoiceAllocations.deliveryNoteLineId),
          )
          .innerJoin(invoiceLines, eq(deliveryInvoiceAllocations.invoiceLineId, invoiceLines.id))
          .innerJoin(invoices, eq(invoiceLines.invoiceId, invoices.id))
          .where(eq(deliveryNoteLines.deliveryNoteId, noteId)),
      ])
      return [
        ...new Map([...direct, ...allocated].map((invoice) => [invoice.id, invoice])).values(),
      ].sort((a, b) => (a.number ?? '').localeCompare(b.number ?? '') || a.id.localeCompare(b.id))
    },
    async billedQuantity(id: string, tx: Database | Transaction = database()) {
      const [row] = await tx
        .select({
          total: sql<number>`coalesce(sum(${deliveryInvoiceAllocations.quantity}),0)::int`,
        })
        .from(deliveryInvoiceAllocations)
        .where(eq(deliveryInvoiceAllocations.deliveryNoteLineId, id))
      return row?.total ?? 0
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
    async invoice(id: string, tx: Transaction) {
      const [row] = await tx.select().from(invoices).where(eq(invoices.id, id)).for('update')
      if (!row || !['issued', 'sent'].includes(row.status))
        throw new AppError(409, 'INVALID_INVOICE', 'Select an active issued invoice.')
      return row
    },
    async invoiceLine(id: string, tx: Transaction) {
      const [row] = await tx
        .select()
        .from(invoiceLines)
        .where(eq(invoiceLines.id, id))
        .for('update')
      if (!row) throw new AppError(400, 'INVALID_INVOICE_LINE', 'Invoice line not found.')
      return row
    },
    async reserved(invoiceLineId: string, exceptNoteId: string | null, tx: Transaction) {
      const [row] = await tx
        .select({ total: sql<number>`coalesce(sum(${deliveryNoteLines.quantity}),0)::int` })
        .from(deliveryNoteLines)
        .innerJoin(deliveryNotes, eq(deliveryNoteLines.deliveryNoteId, deliveryNotes.id))
        .where(
          and(
            eq(deliveryNoteLines.sourceInvoiceLineId, invoiceLineId),
            ne(deliveryNotes.status, 'cancelled'),
            exceptNoteId ? ne(deliveryNotes.id, exceptNoteId) : undefined,
          ),
        )
      return row?.total ?? 0
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
    insert(data: typeof deliveryNotes.$inferInsert, tx: Transaction) {
      return tx
        .insert(deliveryNotes)
        .values(data)
        .returning()
        .then((rows) => rows[0]!)
    },
    update(
      id: string,
      data: Partial<typeof deliveryNotes.$inferInsert>,
      tx: Transaction,
      printable = false,
    ) {
      return tx
        .update(deliveryNotes)
        .set({
          ...data,
          version: sql`${deliveryNotes.version} + 1`,
          ...(printable ? { contentVersion: sql`${deliveryNotes.contentVersion} + 1` } : {}),
          updatedAt: new Date(),
        })
        .where(eq(deliveryNotes.id, id))
        .returning()
        .then((rows) => rows[0]!)
    },
    async replaceLines(
      id: string,
      lines: (typeof deliveryNoteLines.$inferInsert)[],
      tx: Transaction,
    ) {
      await tx.delete(deliveryNoteLines).where(eq(deliveryNoteLines.deliveryNoteId, id))
      if (lines.length) await tx.insert(deliveryNoteLines).values(lines)
    },
    delete(id: string, tx: Transaction) {
      return tx.delete(deliveryNotes).where(eq(deliveryNotes.id, id))
    },
    async list(filters: ListFilters) {
      const term = filters.search?.trim().replace(/[\\%_]/g, '\\$&')
      const allocated = sql`exists (select 1 from delivery_note_lines dnl join delivery_invoice_allocations dia on dia.delivery_note_line_id = dnl.id where dnl.delivery_note_id = ${deliveryNotes.id})`
      const where = and(
        filters.status === 'all' ? undefined : eq(deliveryNotes.status, filters.status),
        filters.clientId ? eq(deliveryNotes.clientId, filters.clientId) : undefined,
        filters.invoiceId ? eq(deliveryNotes.invoiceId, filters.invoiceId) : undefined,
        term
          ? or(
              ilike(deliveryNotes.number, `%${term}%`),
              ilike(clientNameSql, `%${term}%`),
              ilike(clients.tradeName, `%${term}%`),
              ilike(clients.ice, `%${term}%`),
              ilike(clients.taxIdentifier, `%${term}%`),
              ilike(clients.registrationNumber, `%${term}%`),
            )
          : undefined,
        filters.dateFrom ? gte(deliveryNotes.deliveryDate, filters.dateFrom) : undefined,
        filters.dateTo ? lte(deliveryNotes.deliveryDate, filters.dateTo) : undefined,
        filters.billingStatus === 'billed'
          ? or(isNotNull(deliveryNotes.invoiceId), allocated)
          : undefined,
        filters.billingStatus === 'unbilled'
          ? and(isNull(deliveryNotes.invoiceId), sql`not ${allocated}`)
          : undefined,
      )
      const sortColumns = {
        createdAt: deliveryNotes.createdAt,
        deliveryDate: deliveryNotes.deliveryDate,
        number: deliveryNotes.number,
        clientName: clientNameSql,
      }
      const sort = sortColumns[filters.sortBy ?? 'createdAt']
      const direction = filters.sortOrder === 'asc' ? asc : desc
      const [items, count] = await Promise.all([
        database()
          .select()
          .from(deliveryNotes)
          .innerJoin(clients, eq(deliveryNotes.clientId, clients.id))
          .where(where)
          .orderBy(direction(sort), direction(deliveryNotes.id))
          .limit(filters.limit)
          .offset(filters.offset)
          .then((rows) => rows.map((row) => row.delivery_notes)),
        database()
          .select({ total: sql<number>`count(*)::int` })
          .from(deliveryNotes)
          .innerJoin(clients, eq(deliveryNotes.clientId, clients.id))
          .where(where),
      ])
      return { items, total: count[0]?.total ?? 0 }
    },
    async hasBillingAllocations(id: string, tx: Transaction) {
      const [row] = await tx
        .select({ id: deliveryInvoiceAllocations.deliveryNoteLineId })
        .from(deliveryInvoiceAllocations)
        .innerJoin(
          deliveryNoteLines,
          eq(deliveryInvoiceAllocations.deliveryNoteLineId, deliveryNoteLines.id),
        )
        .where(eq(deliveryNoteLines.deliveryNoteId, id))
        .limit(1)
      return Boolean(row)
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
        entityTable: 'delivery_notes',
        entityKey: { id },
        beforeValues: before,
        afterValues: after,
      })
    },
  }
}
