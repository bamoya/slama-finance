import { and, desc, eq, ilike, or, sql } from 'drizzle-orm'

import { clients } from '../../../../../../db/schema/clients.js'
import { creditNoteLines, creditNotes } from '../../../../../../db/schema/credit-notes.js'
import { invoiceLines, invoices } from '../../../../../../db/schema/invoices.js'
import { auditEvents, companySettings } from '../../../../../../db/schema/settings.js'
import type { ListCreditNotesQuery } from '../../../../../contracts/generated/sales/credit-notes.schemas.js'
import { requireActorPermission } from '../../../../../lib/actor-permissions.js'
import type { Database, Transaction } from '../../../../../lib/db.js'
import { AppError } from '../../../../../lib/errors.js'
import { documentClientNameSql } from '../../shared/repositories/document-client.js'
import { nextDocumentNumber } from '../../shared/repositories/document-number.js'

export type CreditNoteRow = typeof creditNotes.$inferSelect
export type CreditNoteLineRow = typeof creditNoteLines.$inferSelect
type Db = Database | Transaction
type Filters = ListCreditNotesQuery
const clientNameSql = documentClientNameSql(creditNotes.clientSnapshot)

export function createCreditNoteRepository(database: () => Database) {
  return {
    nextNumber: nextDocumentNumber,
    transaction: <T>(work: (tx: Transaction) => Promise<T>) => database().transaction(work),
    authorize: requireActorPermission,
    /** Common invoice row lock for cancellation, payments and credit writes (including SQL guards). */
    async lockInvoice(tx: Transaction, invoiceId: string) {
      await tx.execute(sql`select id from invoices where id=${invoiceId}::uuid for update`)
    },
    async one(id: string, tx: Db = database(), lock = false) {
      const query = tx.select().from(creditNotes).where(eq(creditNotes.id, id))
      const [row] = lock ? await query.for('update') : await query
      if (!row) throw new AppError(404, 'CREDIT_NOTE_NOT_FOUND', 'Credit note not found.')
      return row
    },
    lines(id: string, tx: Db = database()) {
      return tx
        .select()
        .from(creditNoteLines)
        .where(eq(creditNoteLines.creditNoteId, id))
        .orderBy(creditNoteLines.position)
    },
    /**
     * `lock` reads the invoice row FOR UPDATE: cancellation and payments lock the same row, so a credit note write
     * and a cancellation or payment of the invoice are serialized and the loser re-reads the committed state.
     */
    async invoice(id: string, tx: Db = database(), lock = false) {
      const query = tx.select().from(invoices).where(eq(invoices.id, id))
      const [row] = lock ? await query.for('update') : await query
      if (!row) throw new AppError(404, 'INVOICE_NOT_FOUND', 'Invoice not found.')
      return row
    },
    invoiceLines(invoiceId: string, tx: Db = database()) {
      return tx
        .select()
        .from(invoiceLines)
        .where(eq(invoiceLines.invoiceId, invoiceId))
        .orderBy(invoiceLines.position)
    },
    /** Quantity, HT and VAT already credited per invoice line by ISSUED credit notes (drafts do not count). */
    async creditedByLine(invoiceId: string, tx: Db = database()) {
      const rows = await tx
        .select({
          invoiceLineId: creditNoteLines.invoiceLineId,
          quantity: sql<string>`coalesce(sum(${creditNoteLines.quantity}),0)::text`,
          net: sql<string>`coalesce(sum(${creditNoteLines.netAmount}),0)::text`,
          tax: sql<string>`coalesce(sum(${creditNoteLines.taxAmount}),0)::text`,
        })
        .from(creditNoteLines)
        .innerJoin(creditNotes, eq(creditNotes.id, creditNoteLines.creditNoteId))
        .where(and(eq(creditNotes.invoiceId, invoiceId), eq(creditNotes.status, 'issued')))
        .groupBy(creditNoteLines.invoiceLineId)
      return new Map(rows.map((row) => [row.invoiceLineId, row]))
    },
    forInvoice(invoiceId: string, tx: Db = database()) {
      return tx
        .select()
        .from(creditNotes)
        .where(eq(creditNotes.invoiceId, invoiceId))
        .orderBy(desc(creditNotes.createdAt), desc(creditNotes.id))
    },
    async company(tx: Db) {
      const [row] = await tx
        .select({ timezone: companySettings.timezone })
        .from(companySettings)
        .where(eq(companySettings.id, 1))
      if (!row)
        throw new AppError(503, 'SETTINGS_NOT_INITIALIZED', 'Apply the company settings migration.')
      return row
    },
    insert(data: typeof creditNotes.$inferInsert, tx: Transaction) {
      return tx
        .insert(creditNotes)
        .values(data)
        .returning()
        .then((rows) => rows[0]!)
    },
    update(
      id: string,
      data: Partial<typeof creditNotes.$inferInsert>,
      tx: Transaction,
      printable = false,
    ) {
      return tx
        .update(creditNotes)
        .set({
          ...data,
          version: sql`${creditNotes.version} + 1`,
          ...(printable ? { contentVersion: sql`${creditNotes.contentVersion} + 1` } : {}),
          updatedAt: new Date(),
        })
        .where(eq(creditNotes.id, id))
        .returning()
        .then((rows) => rows[0]!)
    },
    async replaceLines(
      id: string,
      lines: (typeof creditNoteLines.$inferInsert)[],
      tx: Transaction,
    ) {
      await tx.delete(creditNoteLines).where(eq(creditNoteLines.creditNoteId, id))
      if (lines.length) await tx.insert(creditNoteLines).values(lines)
    },
    delete(id: string, tx: Transaction) {
      return tx.delete(creditNotes).where(eq(creditNotes.id, id))
    },
    async list(filters: Filters) {
      const term = filters.search?.trim().replace(/[\\%_]/g, '\\$&')
      const where = and(
        filters.status && filters.status !== 'all'
          ? eq(creditNotes.status, filters.status)
          : undefined,
        filters.invoiceId ? eq(creditNotes.invoiceId, filters.invoiceId) : undefined,
        filters.clientId ? eq(creditNotes.clientId, filters.clientId) : undefined,
        term
          ? or(
              ilike(creditNotes.number, `%${term}%`),
              ilike(creditNotes.invoiceNumber, `%${term}%`),
              ilike(clientNameSql, `%${term}%`),
            )
          : undefined,
      )
      const [items, count] = await Promise.all([
        database()
          .select()
          .from(creditNotes)
          .leftJoin(clients, eq(creditNotes.clientId, clients.id))
          .where(where)
          .orderBy(desc(creditNotes.createdAt), desc(creditNotes.id))
          .limit(filters.limit)
          .offset(filters.offset)
          .then((rows) => rows.map((row) => row.credit_notes)),
        database()
          .select({ total: sql<number>`count(*)::int` })
          .from(creditNotes)
          .leftJoin(clients, eq(creditNotes.clientId, clients.id))
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
        actorId: actor,
        actorKind: 'user',
        action,
        entityTable: 'credit_notes',
        entityKey: { id },
        beforeValues: before,
        afterValues: after,
      })
    },
  }
}
