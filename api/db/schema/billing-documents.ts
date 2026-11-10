import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { platformUsers } from './organizations.js'
import { subscriptionPayments, subscriptionPlans } from './subscriptions.js'

const admin = sql`current_setting('app.actor_type',true)='platform_admin'`
const ownerReads = (owner: unknown) =>
  sql`${owner}=nullif(current_setting('app.owner_id',true),'')::uuid and current_setting('app.actor_type',true)='owner'`
const amounts = (t: {
  amountHt: unknown
  taxRateBasisPoints: unknown
  taxAmount: unknown
  amountTtc: unknown
}) =>
  sql`${t.amountHt}>=0 and ${t.taxAmount}>=0 and ${t.amountTtc}=${t.amountHt}+${t.taxAmount} and (${t.taxRateBasisPoints} is null or ${t.taxRateBasisPoints} between 0 and 10000)`

/**
 * S6 billing documents. Every row is immutable (integrity SQL rejects UPDATE/DELETE); corrections are
 * new linked rows. Money is integer centimes with its currency and tax rate snapshot.
 */

/** Offer recorded at submission: the pinned version and price the owner accepted, valid until expires_at. */
export const billingQuotes = pgTable(
  'billing_quotes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => platformUsers.id, { onDelete: 'restrict' }),
    planCode: text('plan_code')
      .notNull()
      .references(() => subscriptionPlans.code),
    // Composite FK to plan_versions in integrity SQL.
    planVersionId: uuid('plan_version_id').notNull(),
    cycle: text('cycle', { enum: ['monthly', 'annual'] }).notNull(),
    kind: text('kind', { enum: ['activation', 'renewal', 'upgrade'] }).notNull(),
    currency: text('currency').notNull(),
    amountHt: integer('amount_ht').notNull(),
    taxRateBasisPoints: integer('tax_rate_basis_points'),
    taxAmount: integer('tax_amount').notNull(),
    amountTtc: integer('amount_ttc').notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    check('billing_quote_amounts', amounts(t)),
    check('billing_quote_validity', sql`${t.expiresAt}>${t.issuedAt}`),
    index('billing_quotes_owner').on(t.ownerId, t.issuedAt),
    pgPolicy('billing_quote_owner', { for: 'select', using: ownerReads(t.ownerId) }),
    pgPolicy('billing_quote_owner_insert', { for: 'insert', withCheck: ownerReads(t.ownerId) }),
    pgPolicy('billing_quote_admin', { for: 'all', using: admin, withCheck: admin }),
  ],
).enableRLS()

/** Funds an administrator actually verified for one payment submission. */
export const billingReceipts = pgTable(
  'billing_receipts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => platformUsers.id, { onDelete: 'restrict' }),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => subscriptionPayments.id, { onDelete: 'restrict' }),
    method: text('method').notNull(),
    // Idempotency key per payment: recording the same observed reference twice is a no-op.
    reference: text('reference').notNull(),
    currency: text('currency').notNull(),
    amountTtc: integer('amount_ttc').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
    recordedBy: text('recorded_by').notNull(),
  },
  (t) => [
    check('billing_receipt_amount', sql`${t.amountTtc}>0`),
    check('billing_receipt_reference', sql`btrim(${t.reference})<>''`),
    check('billing_receipt_recorded_by', sql`btrim(${t.recordedBy})<>''`),
    check('billing_receipt_received', sql`${t.receivedAt}<=${t.recordedAt}`),
    uniqueIndex('billing_receipts_reference').on(t.paymentId, t.reference),
    index('billing_receipts_owner').on(t.ownerId),
    pgPolicy('billing_receipt_owner', { for: 'select', using: ownerReads(t.ownerId) }),
    pgPolicy('billing_receipt_admin', { for: 'all', using: admin, withCheck: admin }),
  ],
).enableRLS()

/** Gap-free numbering per series (F invoice, A credit note) and Casablanca calendar year. */
export const billingInvoiceCounters = pgTable(
  'billing_invoice_counters',
  {
    series: text('series', { enum: ['F', 'A'] }).notNull(),
    year: integer('year').notNull(),
    last: integer('last').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.series, t.year] }),
    check('billing_invoice_counter_last', sql`${t.last}>0`),
    pgPolicy('billing_invoice_counter_admin', { for: 'all', using: admin, withCheck: admin }),
  ],
).enableRLS()

/** Issued invoice (one per payment, at its first receipt) or credit note linked to an invoice. */
export const billingInvoices = pgTable(
  'billing_invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => platformUsers.id, { onDelete: 'restrict' }),
    kind: text('kind', { enum: ['invoice', 'credit_note'] }).notNull(),
    series: text('series', { enum: ['F', 'A'] }).notNull(),
    year: integer('year').notNull(),
    sequence: integer('sequence').notNull(),
    number: text('number').notNull(),
    paymentId: uuid('payment_id').references(() => subscriptionPayments.id, {
      onDelete: 'restrict',
    }),
    correctsInvoiceId: uuid('corrects_invoice_id'),
    reason: text('reason'),
    currency: text('currency').notNull(),
    amountHt: integer('amount_ht').notNull(),
    taxRateBasisPoints: integer('tax_rate_basis_points'),
    taxAmount: integer('tax_amount').notNull(),
    amountTtc: integer('amount_ttc').notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull(),
    issuedBy: text('issued_by').notNull(),
  },
  (t) => [
    check('billing_invoice_amounts', amounts(t)),
    check('billing_invoice_positive', sql`${t.amountTtc}>0`),
    check(
      'billing_invoice_kind',
      sql`(${t.kind}='invoice' and ${t.series}='F' and ${t.paymentId} is not null and ${t.correctsInvoiceId} is null and ${t.reason} is null) or (${t.kind}='credit_note' and ${t.series}='A' and ${t.paymentId} is null and ${t.correctsInvoiceId} is not null and btrim(coalesce(${t.reason},''))<>'')`,
    ),
    check(
      'billing_invoice_number',
      sql`${t.number}=${t.series}||'-'||${t.year}::text||'-'||lpad(${t.sequence}::text,6,'0')`,
    ),
    check('billing_invoice_issued_by', sql`btrim(${t.issuedBy})<>''`),
    uniqueIndex('billing_invoices_number').on(t.number),
    uniqueIndex('billing_invoices_sequence').on(t.series, t.year, t.sequence),
    uniqueIndex('billing_invoices_payment').on(t.paymentId),
    index('billing_invoices_owner').on(t.ownerId, t.issuedAt),
    index('billing_invoices_corrects').on(t.correctsInvoiceId),
    pgPolicy('billing_invoice_owner', { for: 'select', using: ownerReads(t.ownerId) }),
    pgPolicy('billing_invoice_admin', { for: 'all', using: admin, withCheck: admin }),
  ],
).enableRLS()

export const billingInvoiceLines = pgTable(
  'billing_invoice_lines',
  {
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => billingInvoices.id, { onDelete: 'restrict' }),
    position: integer('position').notNull(),
    planCode: text('plan_code')
      .notNull()
      .references(() => subscriptionPlans.code),
    planVersionId: uuid('plan_version_id').notNull(),
    cycle: text('cycle', { enum: ['monthly', 'annual'] }).notNull(),
    kind: text('kind', { enum: ['activation', 'renewal', 'upgrade'] }).notNull(),
    currency: text('currency').notNull(),
    amountHt: integer('amount_ht').notNull(),
    taxRateBasisPoints: integer('tax_rate_basis_points'),
    taxAmount: integer('tax_amount').notNull(),
    amountTtc: integer('amount_ttc').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.invoiceId, t.position] }),
    check('billing_invoice_line_amounts', amounts(t)),
    check('billing_invoice_line_position', sql`${t.position}>=1`),
    pgPolicy('billing_invoice_line_owner', {
      for: 'select',
      using: sql`exists(select 1 from billing_invoices i where i.id=${t.invoiceId} and i.owner_id=nullif(current_setting('app.owner_id',true),'')::uuid and current_setting('app.actor_type',true)='owner')`,
    }),
    pgPolicy('billing_invoice_line_admin', { for: 'all', using: admin, withCheck: admin }),
  ],
).enableRLS()

/** Part of a receipt applied to an invoice. Sums are bounded at commit (integrity SQL). */
export const billingAllocations = pgTable(
  'billing_allocations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    receiptId: uuid('receipt_id')
      .notNull()
      .references(() => billingReceipts.id, { onDelete: 'restrict' }),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => billingInvoices.id, { onDelete: 'restrict' }),
    amountTtc: integer('amount_ttc').notNull(),
    allocatedAt: timestamp('allocated_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    check('billing_allocation_amount', sql`${t.amountTtc}>0`),
    uniqueIndex('billing_allocations_pair').on(t.receiptId, t.invoiceId),
    index('billing_allocations_invoice').on(t.invoiceId),
    pgPolicy('billing_allocation_owner', {
      for: 'select',
      using: sql`exists(select 1 from billing_invoices i where i.id=${t.invoiceId} and i.owner_id=nullif(current_setting('app.owner_id',true),'')::uuid and current_setting('app.actor_type',true)='owner')`,
    }),
    pgPolicy('billing_allocation_admin', { for: 'all', using: admin, withCheck: admin }),
  ],
).enableRLS()
