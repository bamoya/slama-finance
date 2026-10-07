import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

import { users } from './auth.js'
import { mediaAssets } from './media.js'

const audit = () => ({
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
})

export const documentTemplates = pgTable(
  'document_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    layout: text('layout', {
      enum: ['classic', 'modern', 'minimal', 'signature', 'atelier', 'ledger', 'essential'],
    })
      .notNull()
      .default('classic'),
    density: text('density', { enum: ['standard', 'compact'] })
      .notNull()
      .default('standard'),
    accentColor: text('accent_color').notNull().default('#ad7d1d'),
    logoAssetId: uuid('logo_asset_id').references(() => mediaAssets.id, { onDelete: 'restrict' }),
    signatureAssetId: uuid('signature_asset_id').references(() => mediaAssets.id, {
      onDelete: 'restrict',
    }),
    showBankDetails: boolean('show_bank_details').notNull().default(true),
    showSignature: boolean('show_signature').notNull().default(false),
    showPaymentTerms: boolean('show_payment_terms').notNull().default(true),
    footerText: text('footer_text'),
    paymentTerms: text('payment_terms'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...audit(),
  },
  (t) => [
    check(
      'template_layout',
      sql`${t.layout} in ('classic','modern','minimal','signature','atelier','ledger','essential')`,
    ),
    check('template_density', sql`${t.density} in ('standard','compact')`),
    check('template_color', sql`${t.accentColor} ~ '^#[0-9a-fA-F]{6}$'`),
    check('template_version', sql`${t.version} > 0`),
  ],
)

export const companySettings = pgTable(
  'company_settings',
  {
    id: smallint('id').primaryKey().default(1),
    legalName: text('legal_name'),
    tradeName: text('trade_name'),
    legalForm: text('legal_form'),
    shareCapital: numeric('share_capital', { precision: 18, scale: 2 }),
    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    city: text('city'),
    postalCode: text('postal_code'),
    countryCode: text('country_code').notNull().default('MA'),
    ice: text('ice'),
    taxIdentifier: text('tax_identifier'),
    registrationNumber: text('registration_number'),
    registrationCity: text('registration_city'),
    professionalTaxNumber: text('professional_tax_number'),
    email: text('email'),
    phone: text('phone'),
    logoAssetId: uuid('logo_asset_id').references(() => mediaAssets.id, { onDelete: 'restrict' }),
    currency: text('currency').notNull().default('MAD'),
    locale: text('locale').notNull().default('fr-MA'),
    timezone: text('timezone').notNull().default('Africa/Casablanca'),
    paymentDueDays: integer('payment_due_days').notNull().default(15),
    estimateValidDays: integer('estimate_valid_days').notNull().default(15),
    defaultTemplateId: uuid('default_template_id').references(() => documentTemplates.id, {
      onDelete: 'restrict',
    }),
    ...audit(),
  },
  (t) => [
    check('company_singleton', sql`${t.id} = 1`),
    check('company_capital', sql`${t.shareCapital} is null or ${t.shareCapital} >= 0`),
    check(
      'company_rc_pair',
      sql`(${t.registrationNumber} is null) = (${t.registrationCity} is null)`,
    ),
    check('company_ice', sql`${t.ice} is null or ${t.ice} ~ '^[0-9]{15}$'`),
    check(
      'company_days',
      sql`${t.paymentDueDays} between 0 and 3650 and ${t.estimateValidDays} between 0 and 3650`,
    ),
    check('company_version', sql`${t.version} > 0`),
  ],
)

export const bankAccounts = pgTable(
  'bank_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    bankName: text('bank_name').notNull(),
    accountHolder: text('account_holder').notNull(),
    rib: text('rib'),
    iban: text('iban'),
    currency: text('currency').notNull().default('MAD'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...audit(),
  },
  (t) => [
    check('bank_rib', sql`${t.rib} is null or ${t.rib} ~ '^[0-9]{24}$'`),
    check('bank_identifier', sql`${t.rib} is not null or ${t.iban} is not null`),
    check('bank_version', sql`${t.version} > 0`),
  ],
)

export const auditEvents = pgTable('audit_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'restrict' }),
  actorKind: text('actor_kind').notNull(),
  action: text('action').notNull(),
  entityTable: text('entity_table').notNull(),
  entityKey: jsonb('entity_key').notNull(),
  beforeValues: jsonb('before_values'),
  afterValues: jsonb('after_values'),
  reason: text('reason'),
  requestId: uuid('request_id'),
  ipAddress: text('ip_address'),
})
