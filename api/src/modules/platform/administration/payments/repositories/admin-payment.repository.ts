import { asc, count, desc, eq, sql } from 'drizzle-orm'

import { platformUsers } from '../../../../../../db/schema/organizations.js'
import { planVersions } from '../../../../../../db/schema/subscription-catalog.js'
import { subscriptionPayments } from '../../../../../../db/schema/subscriptions.js'
import type { Transaction } from '../../../../../lib/db.js'

type PaymentStatus = (typeof subscriptionPayments.$inferSelect)['status']

const paymentColumns = {
  payment: subscriptionPayments,
  ownerEmail: platformUsers.email,
  planVersionNumber: planVersions.versionNumber,
  // S6 billing documents of the submission (quote validity, allocated receipts, invoice).
  quoteExpiresAt:
    sql<Date | null>`(select q.expires_at from billing_quotes q where q.id=${subscriptionPayments.quoteId})`.mapWith(
      (v: string | Date | null) => (v === null ? null : new Date(v)),
    ),
  receivedTtc:
    sql<number>`coalesce((select sum(a.amount_ttc) from billing_allocations a join billing_invoices i on i.id=a.invoice_id where i.payment_id=${subscriptionPayments.id}),0)::int`.mapWith(
      Number,
    ),
  invoiceNumber: sql<
    string | null
  >`(select i.number from billing_invoices i where i.payment_id=${subscriptionPayments.id})`,
}

export function createAdminPaymentRepository() {
  return {
    async payments(
      status: PaymentStatus | undefined,
      page: number,
      pageSize: number,
      tx: Transaction,
    ) {
      const where = status ? eq(subscriptionPayments.status, status) : undefined
      const [rows, [total]] = await Promise.all([
        tx
          .select(paymentColumns)
          .from(subscriptionPayments)
          .innerJoin(platformUsers, eq(platformUsers.id, subscriptionPayments.ownerId))
          .innerJoin(planVersions, eq(planVersions.id, subscriptionPayments.planVersionId))
          .where(where)
          .orderBy(
            status === 'submitted'
              ? asc(subscriptionPayments.submittedAt)
              : desc(subscriptionPayments.submittedAt),
            asc(subscriptionPayments.id),
          )
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        tx.select({ n: count() }).from(subscriptionPayments).where(where),
      ])
      return { rows, total: total?.n ?? 0 }
    },
    async payment(id: string, tx: Transaction) {
      const [row] = await tx
        .select(paymentColumns)
        .from(subscriptionPayments)
        .innerJoin(platformUsers, eq(platformUsers.id, subscriptionPayments.ownerId))
        .innerJoin(planVersions, eq(planVersions.id, subscriptionPayments.planVersionId))
        .where(eq(subscriptionPayments.id, id))
      return row
    },
    forOwner: (ownerId: string, tx: Transaction) =>
      tx
        .select(paymentColumns)
        .from(subscriptionPayments)
        .innerJoin(platformUsers, eq(platformUsers.id, subscriptionPayments.ownerId))
        .innerJoin(planVersions, eq(planVersions.id, subscriptionPayments.planVersionId))
        .where(eq(subscriptionPayments.ownerId, ownerId))
        .orderBy(desc(subscriptionPayments.submittedAt)),
  }
}
