import { and, asc, desc, eq, gte, inArray, lte, or, sql } from 'drizzle-orm'

import { permissions, rolePermissions, userRoles, users } from '../../../../../db/schema/auth.js'
import { clients } from '../../../../../db/schema/clients.js'
import { invoices } from '../../../../../db/schema/invoices.js'
import { payments } from '../../../../../db/schema/payments.js'
import { auditEvents, bankAccounts, companySettings } from '../../../../../db/schema/settings.js'
import type { ListPaymentsQuery } from '../../../../contracts/generated/sales/payments.schemas.js'
import type { Database, Transaction } from '../../../../lib/db.js'
import { AppError } from '../../../../lib/errors.js'
import { companyDate, FinancialDecimal } from '../../../../lib/validation.js'

export type PaymentRow = typeof payments.$inferSelect
type Db = Database | Transaction
export type PaymentBalance = {
  paidAmount: string
  pendingAmount: string
  outstandingAmount: string
  availableBalance: string
  paymentStatus: 'unpaid' | 'partial' | 'paid'
  overdue: boolean
}

const money = (amount: InstanceType<typeof FinancialDecimal>) => amount.toFixed(2)

export async function paymentBalancesForInvoices(db: Db, invoiceIds: string[]) {
  const result = new Map<string, PaymentBalance>()
  if (!invoiceIds.length) return result
  const [rows, company] = await Promise.all([
    db
      .select({
        id: invoices.id,
        total: invoices.total,
        dueDate: invoices.dueDate,
        status: invoices.status,
        paid: sql<string>`coalesce(sum(case when ${payments.status} = 'confirmed' then ${payments.amount} else 0 end), 0)::text`,
        pending: sql<string>`coalesce(sum(case when ${payments.status} = 'pending' then ${payments.amount} else 0 end), 0)::text`,
      })
      .from(invoices)
      .leftJoin(payments, eq(payments.invoiceId, invoices.id))
      .where(inArray(invoices.id, invoiceIds))
      .groupBy(invoices.id),
    db
      .select({ timezone: companySettings.timezone })
      .from(companySettings)
      .where(eq(companySettings.id, 1)),
  ])
  const today = companyDate(new Date(), company[0]?.timezone ?? 'Africa/Casablanca')
  for (const row of rows) {
    const total = new FinancialDecimal(row.total)
    const paid = new FinancialDecimal(row.paid)
    const pending = new FinancialDecimal(row.pending)
    const active = row.status === 'issued' || row.status === 'sent'
    const outstanding = active ? total.minus(paid) : new FinancialDecimal(0)
    const available = outstanding.minus(active ? pending : new FinancialDecimal(0))
    result.set(row.id, {
      paidAmount: money(active ? paid : new FinancialDecimal(0)),
      pendingAmount: money(active ? pending : new FinancialDecimal(0)),
      outstandingAmount: money(outstanding),
      availableBalance: money(available),
      paymentStatus: !active || paid.isZero() ? 'unpaid' : outstanding.lte(0) ? 'paid' : 'partial',
      overdue: active && Boolean(row.dueDate && row.dueDate < today && outstanding.gt(0)),
    })
  }
  return result
}

export async function paymentBalanceForInvoice(db: Db, invoiceId: string) {
  return (await paymentBalancesForInvoices(db, [invoiceId])).get(invoiceId) ?? null
}

export type PaymentListFilters = ListPaymentsQuery

export function createPaymentRepository(database: () => Database) {
  const relation = (db: Db) =>
    db
      .select({
        payment: payments,
        invoiceNumber: invoices.number,
        clientId: clients.id,
        clientName: sql<string>`case when ${clients.type} = 'company' then coalesce(${clients.tradeName}, ${clients.legalName}) else concat_ws(' ', ${clients.firstName}, ${clients.lastName}) end`,
      })
      .from(payments)
      .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
      .innerJoin(clients, eq(invoices.clientId, clients.id))
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
            sql`${users.disabledAt} is null`,
            sql`${users.archivedAt} is null`,
            eq(users.mustChangePassword, false),
            eq(permissions.key, permission),
          ),
        )
        .limit(1)
      if (!row) throw new AppError(403, 'FORBIDDEN', 'Your permissions have changed.')
    },
    async lockOperation(operationId: string, tx: Transaction) {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${operationId}, 73619002))`,
      )
    },
    async invoice(id: string, tx: Transaction) {
      const [row] = await tx.select().from(invoices).where(eq(invoices.id, id)).for('update')
      if (!row) throw new AppError(404, 'INVOICE_NOT_FOUND', 'Invoice not found.')
      return row
    },
    byOperation(operationId: string, tx: Transaction) {
      return tx
        .select()
        .from(payments)
        .where(eq(payments.operationId, operationId))
        .then((rows) => rows[0] ?? null)
    },
    async wasDeletedOperation(operationId: string, tx: Transaction) {
      const [row] = await tx
        .select({ id: auditEvents.id })
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.entityTable, 'payments'),
            eq(auditEvents.action, 'delete'),
            sql`${auditEvents.beforeValues}->>'operationId' = ${operationId}`,
          ),
        )
        .limit(1)
      return Boolean(row)
    },
    async one(id: string, db: Db = database(), lock = false) {
      const query = db.select().from(payments).where(eq(payments.id, id))
      const [row] = lock ? await query.for('update') : await query
      if (!row) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment not found.')
      return row
    },
    async related(id: string, db: Db = database()) {
      const [row] = await relation(db).where(eq(payments.id, id)).limit(1)
      if (!row) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment not found.')
      return row
    },
    async bank(id: string, tx: Transaction) {
      const [row] = await tx.select().from(bankAccounts).where(eq(bankAccounts.id, id))
      if (!row || row.archivedAt)
        throw new AppError(400, 'INVALID_BANK_ACCOUNT', 'Select an active bank account.')
      return row
    },
    async timezone(tx: Transaction) {
      const [row] = await tx
        .select({ timezone: companySettings.timezone })
        .from(companySettings)
        .where(eq(companySettings.id, 1))
      return row?.timezone ?? 'Africa/Casablanca'
    },
    insert(data: typeof payments.$inferInsert, tx: Transaction) {
      return tx
        .insert(payments)
        .values(data)
        .returning()
        .then((rows) => rows[0]!)
    },
    update(id: string, data: Partial<typeof payments.$inferInsert>, tx: Transaction) {
      return tx
        .update(payments)
        .set({ ...data, version: sql`${payments.version} + 1`, updatedAt: new Date() })
        .where(eq(payments.id, id))
        .returning()
        .then((rows) => rows[0]!)
    },
    delete(id: string, tx: Transaction) {
      return tx.delete(payments).where(eq(payments.id, id))
    },
    async receiptMetadata(
      id: string,
      data: Pick<Partial<typeof payments.$inferInsert>, 'receiptSnapshot' | 'receiptIssuedAt'>,
      tx: Transaction,
    ) {
      const [row] = await tx.update(payments).set(data).where(eq(payments.id, id)).returning()
      return row!
    },
    async list(filters: PaymentListFilters) {
      const term = filters.search?.trim()
      const where = and(
        filters.invoiceId ? eq(payments.invoiceId, filters.invoiceId) : undefined,
        filters.clientId ? eq(invoices.clientId, filters.clientId) : undefined,
        filters.method ? eq(payments.method, filters.method) : undefined,
        filters.status ? eq(payments.status, filters.status) : undefined,
        filters.dateFrom ? gte(payments.paymentDate, filters.dateFrom) : undefined,
        filters.dateTo ? lte(payments.paymentDate, filters.dateTo) : undefined,
        term
          ? or(
              sql`${payments.number} ilike ${`%${term}%`}`,
              sql`${invoices.number} ilike ${`%${term}%`}`,
              sql`${clients.legalName} ilike ${`%${term}%`}`,
              sql`${clients.tradeName} ilike ${`%${term}%`}`,
              sql`${clients.firstName} ilike ${`%${term}%`}`,
              sql`${clients.lastName} ilike ${`%${term}%`}`,
              sql`concat_ws(' ', ${clients.firstName}, ${clients.lastName}) ilike ${`%${term}%`}`,
              sql`${payments.reference} ilike ${`%${term}%`}`,
              sql`${payments.chequeNumber} ilike ${`%${term}%`}`,
            )
          : undefined,
      )
      const order =
        filters.sort === 'oldest'
          ? [asc(payments.createdAt), asc(payments.id)]
          : filters.sort === 'amount_asc'
            ? [asc(payments.amount), desc(payments.createdAt), desc(payments.id)]
            : filters.sort === 'amount_desc'
              ? [desc(payments.amount), desc(payments.createdAt), desc(payments.id)]
              : [desc(payments.createdAt), desc(payments.id)]
      const [items, count] = await Promise.all([
        relation(database())
          .where(where)
          .orderBy(...order)
          .limit(filters.limit)
          .offset(filters.offset),
        database()
          .select({ total: sql<number>`count(*)::int` })
          .from(payments)
          .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
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
      reason?: string,
    ) {
      return tx.insert(auditEvents).values({
        actorUserId: actor,
        actorKind: 'user',
        action,
        entityTable: 'payments',
        entityKey: { id },
        beforeValues: before,
        afterValues: after,
        reason,
      })
    },
  }
}
