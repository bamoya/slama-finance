import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { users } from './auth.js'
import { products, productVariants } from './catalog.js'
import { clients } from './clients.js'
import { invoiceLines, invoices } from './invoices.js'

export const deliveryNotes = pgTable(
  'delivery_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    number: text('number').unique(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'restrict' }),
    status: text('status').notNull().default('draft'),
    deliveryDate: date('delivery_date').notNull(),
    issuerSnapshot: jsonb('issuer_snapshot').notNull(),
    localeOverride: text('locale_override'),
    clientSnapshot: jsonb('client_snapshot').notNull(),
    deliveryAddress: text('delivery_address').notNull(),
    instructions: text('instructions'),
    includeReceptionSignature: boolean('include_reception_signature').notNull().default(true),
    receivedByName: text('received_by_name'),
    signatureObjectKey: text('signature_object_key'),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
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
    index('delivery_notes_client_status_idx').on(t.clientId, t.status),
    index('delivery_notes_invoice_idx').on(t.invoiceId),
    check(
      'delivery_notes_status',
      sql`${t.status} in ('draft','prepared','delivered','acknowledged','cancelled')`,
    ),
    check('delivery_notes_versions', sql`${t.version} > 0 and ${t.contentVersion} > 0`),
    check(
      'delivery_notes_locale_override',
      sql`${t.localeOverride} is null or ${t.localeOverride} in ('fr-MA','en-GB')`,
    ),
    check('delivery_notes_address', sql`length(trim(${t.deliveryAddress})) > 0`),
    check(
      'delivery_notes_prepared_data',
      sql`(${t.status} = 'draft' and ${t.number} is null) or (${t.status} <> 'draft' and ${t.number} is not null)`,
    ),
  ],
)

export const deliveryNoteLines = pgTable(
  'delivery_note_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deliveryNoteId: uuid('delivery_note_id')
      .notNull()
      .references(() => deliveryNotes.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'restrict' }),
    productVariantId: uuid('product_variant_id').references(() => productVariants.id, {
      onDelete: 'restrict',
    }),
    sourceInvoiceLineId: uuid('source_invoice_line_id').references(() => invoiceLines.id, {
      onDelete: 'restrict',
    }),
    position: integer('position').notNull(),
    productName: text('product_name').notNull(),
    productReference: text('product_reference'),
    packageWeightG: integer('package_weight_g'),
    quantity: integer('quantity').notNull(),
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
    uniqueIndex('delivery_note_lines_position_uq').on(t.deliveryNoteId, t.position),
    index('delivery_note_lines_source_invoice_idx').on(t.sourceInvoiceLineId),
    check('delivery_note_lines_position', sql`${t.position} >= 0`),
    check('delivery_note_lines_quantity', sql`${t.quantity} > 0`),
    check('delivery_note_lines_name', sql`length(trim(${t.productName})) > 0`),
    check(
      'delivery_note_lines_weight',
      sql`${t.packageWeightG} is null or ${t.packageWeightG} > 0`,
    ),
    check(
      'delivery_note_lines_variant_pair',
      sql`${t.productVariantId} is null or ${t.productId} is not null`,
    ),
  ],
)

export const deliveryInvoiceAllocations = pgTable(
  'delivery_invoice_allocations',
  {
    invoiceLineId: uuid('invoice_line_id')
      .notNull()
      .references(() => invoiceLines.id, { onDelete: 'cascade' }),
    deliveryNoteLineId: uuid('delivery_note_line_id')
      .notNull()
      .references(() => deliveryNoteLines.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.invoiceLineId, t.deliveryNoteLineId] }),
    index('delivery_invoice_allocations_delivery_idx').on(t.deliveryNoteLineId),
    check('delivery_invoice_allocations_quantity', sql`${t.quantity} > 0`),
  ],
)
