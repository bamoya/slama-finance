import { sql } from 'drizzle-orm'
import {
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { users } from './auth.js'
import { invoices } from './invoices.js'
import { bankAccounts } from './settings.js'

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    number: text('number').notNull().unique(),
    operationId: uuid('operation_id').notNull().unique(),
    creationRequest: jsonb('creation_request').notNull(),
    receiptSnapshot: jsonb('receipt_snapshot'),
    receiptIssuedAt: timestamp('receipt_issued_at', { withTimezone: true }),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'restrict' }),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    currency: text('currency').notNull(),
    method: text('method').notNull(),
    status: text('status').notNull(),
    paymentDate: date('payment_date').notNull(),
    collectedOn: date('collected_on'),
    bankAccountId: uuid('bank_account_id').references(() => bankAccounts.id, {
      onDelete: 'restrict',
    }),
    reference: text('reference'),
    chequeBank: text('cheque_bank'),
    chequeNumber: text('cheque_number'),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancellationReason: text('cancellation_reason'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [
    index('payments_invoice_status_idx').on(t.invoiceId, t.status),
    index('payments_collection_idx').on(t.collectedOn, t.status),
    uniqueIndex('payments_cheque_identity_idx')
      .on(t.chequeBank, t.chequeNumber)
      .where(sql`${t.status} <> 'cancelled' and ${t.method} = 'cheque'`),
    check('payments_amount_positive', sql`${t.amount} > 0`),
    check('payments_currency', sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check('payments_method', sql`${t.method} in ('cash','bank_transfer','cheque')`),
    check('payments_status', sql`${t.status} in ('pending','confirmed','cancelled')`),
    check('payments_version', sql`${t.version} > 0`),
    check(
      'payments_method_fields',
      sql`(
      (${t.method} = 'cash' and ${t.status} <> 'pending' and ${t.bankAccountId} is null and ${t.reference} is null and ${t.chequeBank} is null and ${t.chequeNumber} is null)
      or (${t.method} = 'bank_transfer' and ${t.reference} is not null and length(trim(${t.reference})) > 0 and ${t.chequeBank} is null and ${t.chequeNumber} is null)
      or (${t.method} = 'cheque' and ${t.chequeBank} is not null and length(trim(${t.chequeBank})) > 0 and ${t.chequeNumber} is not null and length(trim(${t.chequeNumber})) > 0 and ${t.reference} is null)
    )`,
    ),
    check(
      'payments_status_dates',
      sql`(
      (${t.status} = 'pending' and ${t.collectedOn} is null and ${t.confirmedAt} is null and ${t.cancelledAt} is null and ${t.cancellationReason} is null)
      or (${t.status} = 'confirmed' and ${t.collectedOn} is not null and ${t.confirmedAt} is not null and ${t.cancelledAt} is null and ${t.cancellationReason} is null)
      or (${t.status} = 'cancelled' and ${t.cancelledAt} is not null and ${t.cancellationReason} is not null and length(trim(${t.cancellationReason})) > 0)
    )`,
    ),
  ],
)
