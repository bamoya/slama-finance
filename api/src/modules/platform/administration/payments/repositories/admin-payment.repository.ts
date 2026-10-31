import { asc, count, desc, eq } from 'drizzle-orm'

import { platformUsers } from '../../../../../../db/schema/organizations.js'
import { subscriptionPayments } from '../../../../../../db/schema/subscriptions.js'
import type { Transaction } from '../../../../../lib/db.js'

type PaymentStatus = (typeof subscriptionPayments.$inferSelect)['status']

const paymentColumns = { payment: subscriptionPayments, ownerEmail: platformUsers.email }

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
        .where(eq(subscriptionPayments.id, id))
      return row
    },
    forOwner: (ownerId: string, tx: Transaction) =>
      tx
        .select(paymentColumns)
        .from(subscriptionPayments)
        .innerJoin(platformUsers, eq(platformUsers.id, subscriptionPayments.ownerId))
        .where(eq(subscriptionPayments.ownerId, ownerId))
        .orderBy(desc(subscriptionPayments.submittedAt)),
  }
}
