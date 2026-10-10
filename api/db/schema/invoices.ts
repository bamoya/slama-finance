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
import { products, productVariants } from './catalog.js'
import { clients } from './clients.js'
import { estimates } from './estimates.js'
import { documentTemplates } from './settings.js'

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    number: text('number').unique(),
    status: text('status').notNull().default('draft'),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    templateId: uuid('template_id').references(() => documentTemplates.id, {
      onDelete: 'restrict',
    }),
    sourceEstimateId: uuid('source_estimate_id').references(() => estimates.id, {
      onDelete: 'restrict',
    }),
    conversionOperationId: uuid('conversion_operation_id').unique(),
    conversionRequest: jsonb('conversion_request'),
    issueDate: date('issue_date').notNull(),
    dueDate: date('due_date'),
    currency: text('currency').notNull().default('MAD'),
    locale: text('locale').notNull().default('fr-MA'),
    localeOverride: text('locale_override'),
    issuerSnapshot: jsonb('issuer_snapshot').notNull(),
    clientSnapshot: jsonb('client_snapshot').notNull(),
    appearanceSnapshot: jsonb('appearance_snapshot').notNull(),
    bankDetailsSnapshot: jsonb('bank_details_snapshot'),
    notes: text('notes'),
    paymentTerms: text('payment_terms'),
    subtotal: numeric('subtotal', { precision: 18, scale: 2 }).notNull().default('0'),
    taxTotal: numeric('tax_total', { precision: 18, scale: 2 }).notNull().default('0'),
    total: numeric('total', { precision: 18, scale: 2 }).notNull().default('0'),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancellationReason: text('cancellation_reason'),
    version: integer('version').notNull().default(1),
    contentVersion: integer('content_version').notNull().default(1),
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
    index('invoices_client_status_idx').on(t.clientId, t.status),
    index('invoices_source_estimate_idx').on(t.sourceEstimateId),
    check('invoices_status', sql`${t.status} in ('draft','issued','sent','cancelled')`),
    check('invoices_currency', sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check('invoices_locale', sql`${t.locale} in ('fr-MA','en-GB')`),
    check(
      'invoices_locale_override',
      sql`${t.localeOverride} is null or ${t.localeOverride} in ('fr-MA','en-GB')`,
    ),
    check('invoices_versions', sql`${t.version} > 0 and ${t.contentVersion} > 0`),
    check(
      'invoices_totals',
      sql`${t.subtotal} >= 0 and ${t.taxTotal} >= 0 and ${t.total} = ${t.subtotal} + ${t.taxTotal}`,
    ),
    check(
      'invoices_issued_data',
      sql`(${t.status} = 'draft' and ${t.number} is null and ${t.issuedAt} is null) or (${t.status} <> 'draft' and ${t.number} is not null and ${t.issuedAt} is not null and ${t.dueDate} is not null)`,
    ),
    check(
      'invoices_conversion_pair',
      sql`(${t.conversionOperationId} is null) = (${t.conversionRequest} is null) and (${t.sourceEstimateId} is null or ${t.conversionOperationId} is not null)`,
    ),
  ],
)

export const invoiceLines = pgTable(
  'invoice_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'restrict' }),
    productVariantId: uuid('product_variant_id').references(() => productVariants.id, {
      onDelete: 'restrict',
    }),
    position: integer('position').notNull(),
    productName: text('product_name').notNull(),
    productReference: text('product_reference'),
    packageWeightG: integer('package_weight_g'),
    quantity: integer('quantity').notNull(),
    unitPrice: numeric('unit_price', { precision: 18, scale: 2 }).notNull(),
    vatRate: numeric('vat_rate', { precision: 5, scale: 2 }),
    netAmount: numeric('net_amount', { precision: 18, scale: 2 }).notNull(),
    taxAmount: numeric('tax_amount', { precision: 18, scale: 2 }).notNull(),
    totalAmount: numeric('total_amount', { precision: 18, scale: 2 }).notNull(),
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
    uniqueIndex('invoice_lines_position_uq').on(t.invoiceId, t.position),
    index('invoice_lines_product_idx').on(t.productId),
    check('invoice_lines_position', sql`${t.position} >= 0`),
    check('invoice_lines_product_name', sql`length(trim(${t.productName})) > 0`),
    check('invoice_lines_quantity', sql`${t.quantity} > 0`),
    check('invoice_lines_price', sql`${t.unitPrice} >= 0`),
    check('invoice_lines_weight', sql`${t.packageWeightG} is null or ${t.packageWeightG} > 0`),
    check(
      'invoice_lines_vat',
      sql`${t.vatRate} is null or (${t.vatRate} >= 0 and ${t.vatRate} <= 100)`,
    ),
    check(
      'invoice_lines_totals',
      sql`${t.netAmount} >= 0 and ${t.taxAmount} >= 0 and ${t.totalAmount} = ${t.netAmount} + ${t.taxAmount}`,
    ),
    check(
      'invoice_lines_variant_pair',
      sql`${t.productVariantId} is null or ${t.productId} is not null`,
    ),
  ],
)
