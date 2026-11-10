import { and, asc, count, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'

import {
  billingAllocations,
  billingInvoiceCounters,
  billingInvoiceLines,
  billingInvoices,
  billingQuotes,
  billingReceipts,
} from '../../../../../db/schema/billing-documents.js'
import { platformUsers } from '../../../../../db/schema/organizations.js'
import { planVersions } from '../../../../../db/schema/subscription-catalog.js'
import type { Transaction } from '../../../../lib/db.js'

export type QuoteRow = typeof billingQuotes.$inferSelect
export type InvoiceRow = typeof billingInvoices.$inferSelect
export type InvoiceLineRow = typeof billingInvoiceLines.$inferSelect & { planVersionNumber: number }
/** Issued document with its lines and derived amounts (never stored). */
export type InvoiceRecord = InvoiceRow & {
  ownerEmail: string
  correctsNumber: string | null
  lines: InvoiceLineRow[]
  allocatedTtc: number
  creditedTtc: number
}
/** Billing document facts shown beside a payment submission. */
export type PaymentDocuments = {
  quoteExpiresAt: Date | null
  receivedTtc: number
  invoiceNumber: string | null
}

const sum = (column: unknown) => sql<number>`coalesce(sum(${column}),0)::int`

export function createBillingDocumentsRepository() {
  /** Lines, allocation and credit totals for the given invoices (one query each). */
  async function complete(
    rows: (InvoiceRow & { ownerEmail: string; correctsNumber: string | null })[],
    tx: Transaction,
  ): Promise<InvoiceRecord[]> {
    const ids = rows.map((r) => r.id)
    if (!ids.length) return []
    const [lines, allocated, credited] = await Promise.all([
      tx
        .select({ line: billingInvoiceLines, planVersionNumber: planVersions.versionNumber })
        .from(billingInvoiceLines)
        .innerJoin(planVersions, eq(planVersions.id, billingInvoiceLines.planVersionId))
        .where(inArray(billingInvoiceLines.invoiceId, ids))
        .orderBy(asc(billingInvoiceLines.position)),
      tx
        .select({ id: billingAllocations.invoiceId, total: sum(billingAllocations.amountTtc) })
        .from(billingAllocations)
        .where(inArray(billingAllocations.invoiceId, ids))
        .groupBy(billingAllocations.invoiceId),
      tx
        .select({ id: billingInvoices.correctsInvoiceId, total: sum(billingInvoices.amountTtc) })
        .from(billingInvoices)
        .where(inArray(billingInvoices.correctsInvoiceId, ids))
        .groupBy(billingInvoices.correctsInvoiceId),
    ])
    const totals = (list: { id: string | null; total: number }[]) =>
      new Map(list.map((r) => [r.id, Number(r.total)]))
    const paid = totals(allocated),
      credit = totals(credited)
    return rows.map((r) => ({
      ...r,
      lines: lines
        .filter((l) => l.line.invoiceId === r.id)
        .map((l) => ({ ...l.line, planVersionNumber: l.planVersionNumber })),
      allocatedTtc: paid.get(r.id) ?? 0,
      creditedTtc: credit.get(r.id) ?? 0,
    }))
  }
  const corrected = sql<
    string | null
  >`(select c.number from billing_invoices c where c.id=billing_invoices.corrects_invoice_id)`
  const invoiceColumns = {
    invoice: billingInvoices,
    ownerEmail: platformUsers.email,
    correctsNumber: corrected,
  }
  const flatten = (
    rows: { invoice: InvoiceRow; ownerEmail: string; correctsNumber: string | null }[],
  ) =>
    rows.map((r) => ({ ...r.invoice, ownerEmail: r.ownerEmail, correctsNumber: r.correctsNumber }))

  return {
    async insertQuote(values: typeof billingQuotes.$inferInsert, tx: Transaction) {
      const [row] = await tx.insert(billingQuotes).values(values).returning()
      return row!
    },
    async quote(id: string, tx: Transaction) {
      const [row] = await tx.select().from(billingQuotes).where(eq(billingQuotes.id, id))
      return row
    },
    async receipt(paymentId: string, reference: string, tx: Transaction) {
      const [row] = await tx
        .select()
        .from(billingReceipts)
        .where(
          and(eq(billingReceipts.paymentId, paymentId), eq(billingReceipts.reference, reference)),
        )
      return row
    },
    async insertReceipt(values: typeof billingReceipts.$inferInsert, tx: Transaction) {
      const [row] = await tx.insert(billingReceipts).values(values).returning()
      return row!
    },
    async invoiceForPayment(paymentId: string, tx: Transaction) {
      const [row] = await tx
        .select()
        .from(billingInvoices)
        .where(eq(billingInvoices.paymentId, paymentId))
      return row
    },
    /**
     * Next gap-free number of a series in the current calendar year of `timezone`. The counter row
     * stays locked until commit, and the issue instant is read after that lock (clock_timestamp),
     * so numbers follow issue instants.
     */
    async nextSequence(series: 'F' | 'A', timezone: string, tx: Transaction) {
      const [row] = await tx
        .insert(billingInvoiceCounters)
        .values({
          series,
          year: sql`extract(year from clock_timestamp() at time zone ${timezone})::int`,
          last: 1,
        })
        .onConflictDoUpdate({
          target: [billingInvoiceCounters.series, billingInvoiceCounters.year],
          set: { last: sql`${billingInvoiceCounters.last}+1` },
        })
        .returning({
          last: billingInvoiceCounters.last,
          year: billingInvoiceCounters.year,
          issuedAt: sql<string>`clock_timestamp()`,
        })
      return { sequence: row!.last, year: row!.year, issuedAt: new Date(row!.issuedAt) }
    },
    async insertInvoice(
      values: typeof billingInvoices.$inferInsert,
      lines: Omit<typeof billingInvoiceLines.$inferInsert, 'invoiceId'>[],
      tx: Transaction,
    ) {
      const [row] = await tx.insert(billingInvoices).values(values).returning()
      await tx.insert(billingInvoiceLines).values(lines.map((l) => ({ ...l, invoiceId: row!.id })))
      return row!
    },
    insertAllocation: (values: typeof billingAllocations.$inferInsert, tx: Transaction) =>
      tx.insert(billingAllocations).values(values),
    async allocated(invoiceId: string, tx: Transaction) {
      const [row] = await tx
        .select({ total: sum(billingAllocations.amountTtc) })
        .from(billingAllocations)
        .where(eq(billingAllocations.invoiceId, invoiceId))
      return Number(row?.total ?? 0)
    },
    async credited(invoiceId: string, tx: Transaction) {
      return (await this.creditedSplit(invoiceId, tx)).ttc
    },
    /** HT, tax and TTC already credited against an invoice. */
    async creditedSplit(invoiceId: string, tx: Transaction) {
      const [row] = await tx
        .select({
          ht: sum(billingInvoices.amountHt),
          tax: sum(billingInvoices.taxAmount),
          ttc: sum(billingInvoices.amountTtc),
        })
        .from(billingInvoices)
        .where(eq(billingInvoices.correctsInvoiceId, invoiceId))
      return { ht: Number(row?.ht ?? 0), tax: Number(row?.tax ?? 0), ttc: Number(row?.ttc ?? 0) }
    },
    async invoice(id: string, tx: Transaction) {
      const rows = await tx
        .select(invoiceColumns)
        .from(billingInvoices)
        .innerJoin(platformUsers, eq(platformUsers.id, billingInvoices.ownerId))
        .where(eq(billingInvoices.id, id))
      return (await complete(flatten(rows), tx))[0]
    },
    /** Newest first; optional owner filter; offset pagination. */
    async invoices(filter: { ownerId?: string; page: number; pageSize: number }, tx: Transaction) {
      const where = filter.ownerId ? eq(billingInvoices.ownerId, filter.ownerId) : undefined
      const [rows, [total]] = await Promise.all([
        tx
          .select(invoiceColumns)
          .from(billingInvoices)
          .innerJoin(platformUsers, eq(platformUsers.id, billingInvoices.ownerId))
          .where(where)
          .orderBy(desc(billingInvoices.issuedAt), desc(billingInvoices.number))
          .limit(filter.pageSize)
          .offset((filter.page - 1) * filter.pageSize),
        tx.select({ n: count() }).from(billingInvoices).where(where),
      ])
      return { rows: await complete(flatten(rows), tx), total: total?.n ?? 0 }
    },
    /** Quote expiry, allocated receipts and invoice number per payment submission. */
    async forPayments(
      payments: { id: string; quoteId: string | null }[],
      tx: Transaction,
    ): Promise<Map<string, PaymentDocuments>> {
      const quoteIds = payments.map((p) => p.quoteId).filter((id): id is string => Boolean(id))
      const paymentIds = payments.map((p) => p.id)
      if (!paymentIds.length) return new Map()
      const [quotes, invoices] = await Promise.all([
        quoteIds.length
          ? tx
              .select({ id: billingQuotes.id, expiresAt: billingQuotes.expiresAt })
              .from(billingQuotes)
              .where(inArray(billingQuotes.id, quoteIds))
          : [],
        tx
          .select({
            paymentId: billingInvoices.paymentId,
            number: billingInvoices.number,
            // Qualified explicitly: drizzle renders single-table columns unqualified.
            received: sql<number>`coalesce((select sum(a.amount_ttc) from billing_allocations a where a.invoice_id=billing_invoices.id),0)::int`,
          })
          .from(billingInvoices)
          .where(
            and(
              isNotNull(billingInvoices.paymentId),
              inArray(billingInvoices.paymentId, paymentIds),
            ),
          ),
      ])
      const expiry = new Map(quotes.map((q) => [q.id, q.expiresAt]))
      const issued = new Map(invoices.map((i) => [i.paymentId, i]))
      return new Map(
        payments.map((p) => {
          const invoice = issued.get(p.id)
          return [
            p.id,
            {
              quoteExpiresAt: p.quoteId ? (expiry.get(p.quoteId) ?? null) : null,
              receivedTtc: Number(invoice?.received ?? 0),
              invoiceNumber: invoice?.number ?? null,
            },
          ]
        }),
      )
    },
  }
}
