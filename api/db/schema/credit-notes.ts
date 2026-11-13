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

import { actors } from './actors.js'
import { clients } from './clients.js'
import { invoiceLines, invoices } from './invoices.js'
import { organizationColumn, tenantPolicy } from './tenant.js'

/**
 * Credit note (avoir) correcting ONE issued invoice. Numbered at issue (AVO legal, AVS simple), then frozen by
 * integrity triggers (sales-documents.sql). Identity snapshots are copied from the credited invoice, never live.
 */
export const creditNotes = pgTable(
  'credit_notes',
  {
    organizationId: organizationColumn(),
    id: uuid('id').primaryKey().defaultRandom(),
    number: text('number'),
    status: text('status').notNull().default('draft'),
    /** Inherited from the credited invoice: legal -> AVO series, simple -> AVS series. */
    kind: text('kind', { enum: ['simple', 'legal'] }).notNull(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'restrict' }),
    invoiceNumber: text('invoice_number').notNull(),
    invoiceIssueDate: date('invoice_issue_date').notNull(),
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'restrict' }),
    /** Informational copy of the invoice template; no foreign key so a template can still be deleted. */
    templateId: uuid('template_id'),
    currency: text('currency').notNull(),
    locale: text('locale').notNull(),
    reason: text('reason').notNull(),
    issuerSnapshot: jsonb('issuer_snapshot').notNull(),
    clientSnapshot: jsonb('client_snapshot').notNull(),
    appearanceSnapshot: jsonb('appearance_snapshot').notNull(),
    bankDetailsSnapshot: jsonb('bank_details_snapshot'),
    subtotal: numeric('subtotal', { precision: 18, scale: 2 }).notNull().default('0'),
    taxTotal: numeric('tax_total', { precision: 18, scale: 2 }).notNull().default('0'),
    total: numeric('total', { precision: 18, scale: 2 }).notNull().default('0'),
    issueDate: date('issue_date'),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    contentVersion: integer('content_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdByActorId: uuid('created_by_actor_id').references(() => actors.id, {
      onDelete: 'set null',
    }),
    updatedByActorId: uuid('updated_by_actor_id').references(() => actors.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [
    tenantPolicy(t.organizationId),
    uniqueIndex('credit_notes_number_tenant_unique').on(t.organizationId, t.number),
    index('credit_notes_invoice_idx').on(t.organizationId, t.invoiceId, t.status),
    index('credit_notes_client_idx').on(t.organizationId, t.clientId, t.status),
    check('credit_notes_status', sql`${t.status} in ('draft','issued')`),
    check('credit_notes_currency', sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check('credit_notes_locale', sql`${t.locale} in ('fr-MA','en-GB')`),
    check('credit_notes_reason', sql`length(trim(${t.reason})) > 0`),
    check('credit_notes_versions', sql`${t.version} > 0 and ${t.contentVersion} > 0`),
    check(
      'credit_notes_totals',
      sql`${t.subtotal} >= 0 and ${t.taxTotal} >= 0 and ${t.total} = ${t.subtotal} + ${t.taxTotal}`,
    ),
    check(
      'credit_notes_issued_data',
      sql`(${t.status} = 'draft' and ${t.number} is null and ${t.issuedAt} is null and ${t.issueDate} is null) or (${t.status} = 'issued' and ${t.number} is not null and ${t.issuedAt} is not null and ${t.issueDate} is not null)`,
    ),
    check(
      'credit_notes_kind',
      sql`${t.number} is null or (${t.kind} = 'legal' and ${t.number} like 'AVO-%') or (${t.kind} = 'simple' and ${t.number} like 'AVS-%')`,
    ),
  ],
).enableRLS()

export const creditNoteLines = pgTable(
  'credit_note_lines',
  {
    organizationId: organizationColumn(),
    id: uuid('id').primaryKey().defaultRandom(),
    creditNoteId: uuid('credit_note_id')
      .notNull()
      .references(() => creditNotes.id, { onDelete: 'cascade' }),
    invoiceLineId: uuid('invoice_line_id')
      .notNull()
      .references(() => invoiceLines.id, { onDelete: 'restrict' }),
    position: integer('position').notNull(),
    productName: text('product_name').notNull(),
    productReference: text('product_reference'),
    /** Units credited; 0 for an amount-only correction (discount, price correction). */
    quantity: integer('quantity').notNull().default(0),
    unitPrice: numeric('unit_price', { precision: 18, scale: 2 }).notNull(),
    vatRate: numeric('vat_rate', { precision: 5, scale: 2 }),
    netAmount: numeric('net_amount', { precision: 18, scale: 2 }).notNull(),
    taxAmount: numeric('tax_amount', { precision: 18, scale: 2 }).notNull(),
    totalAmount: numeric('total_amount', { precision: 18, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdByActorId: uuid('created_by_actor_id').references(() => actors.id, {
      onDelete: 'set null',
    }),
    updatedByActorId: uuid('updated_by_actor_id').references(() => actors.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [
    tenantPolicy(t.organizationId),
    uniqueIndex('credit_note_lines_position_uq').on(t.organizationId, t.creditNoteId, t.position),
    uniqueIndex('credit_note_lines_invoice_line_uq').on(
      t.organizationId,
      t.creditNoteId,
      t.invoiceLineId,
    ),
    index('credit_note_lines_invoice_line_idx').on(t.organizationId, t.invoiceLineId),
    check('credit_note_lines_position', sql`${t.position} >= 0`),
    check('credit_note_lines_quantity', sql`${t.quantity} >= 0`),
    check('credit_note_lines_price', sql`${t.unitPrice} >= 0`),
    check(
      'credit_note_lines_vat',
      sql`${t.vatRate} is null or (${t.vatRate} >= 0 and ${t.vatRate} <= 100)`,
    ),
    check(
      'credit_note_lines_totals',
      sql`${t.netAmount} >= 0 and (${t.netAmount} > 0 or ${t.quantity} > 0) and ${t.taxAmount} >= 0 and ${t.totalAmount} = ${t.netAmount} + ${t.taxAmount}`,
    ),
  ],
).enableRLS()
