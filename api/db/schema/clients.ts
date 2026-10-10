import { sql } from 'drizzle-orm'
import { check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { users } from './auth.js'

export const clients = pgTable(
  'clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: text('type').notNull(),
    firstName: text('first_name'),
    lastName: text('last_name'),
    legalName: text('legal_name'),
    tradeName: text('trade_name'),
    contactName: text('contact_name'),
    email: text('email'),
    phone: text('phone'),
    ice: text('ice'),
    taxIdentifier: text('tax_identifier'),
    registrationNumber: text('registration_number'),
    registrationCity: text('registration_city'),
    professionalTaxNumber: text('professional_tax_number'),
    addressLine1: text('address_line1').notNull(),
    addressLine2: text('address_line2'),
    city: text('city').notNull(),
    postalCode: text('postal_code'),
    countryCode: text('country_code').notNull().default('MA'),
    deliveryAddressLine1: text('delivery_address_line1'),
    deliveryAddressLine2: text('delivery_address_line2'),
    deliveryCity: text('delivery_city'),
    deliveryPostalCode: text('delivery_postal_code'),
    deliveryCountryCode: text('delivery_country_code'),
    locale: text('locale').notNull().default('fr-MA'),
    notes: text('notes'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
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
    index('clients_type_status_idx').on(t.type, t.archivedAt),
    index('clients_email_idx').on(t.email),
    check('client_type_valid', sql`${t.type} in ('individual', 'company')`),
    check(
      'client_identity_valid',
      sql`(
    (${t.type} = 'individual' and ${t.firstName} is not null and ${t.lastName} is not null
      and length(trim(${t.firstName})) > 0 and length(trim(${t.lastName})) > 0
      and ${t.legalName} is null and ${t.tradeName} is null and ${t.contactName} is null
      and ${t.ice} is null and ${t.taxIdentifier} is null and ${t.registrationNumber} is null
      and ${t.registrationCity} is null and ${t.professionalTaxNumber} is null)
    or (${t.type} = 'company' and ${t.legalName} is not null and length(trim(${t.legalName})) > 0 and ${t.firstName} is null and ${t.lastName} is null)
  )`,
    ),
    check(
      'client_rc_pair',
      sql`(${t.registrationNumber} is null) = (${t.registrationCity} is null)`,
    ),
    check(
      'client_billing_address',
      sql`length(trim(${t.addressLine1})) > 0 and length(trim(${t.city})) > 0 and ${t.countryCode} ~ '^[A-Z]{2}$'`,
    ),
    check(
      'client_delivery_address',
      sql`(
    (${t.deliveryAddressLine1} is null and ${t.deliveryAddressLine2} is null and ${t.deliveryCity} is null
      and ${t.deliveryPostalCode} is null and ${t.deliveryCountryCode} is null)
    or (${t.deliveryAddressLine1} is not null and length(trim(${t.deliveryAddressLine1})) > 0
      and ${t.deliveryCity} is not null and length(trim(${t.deliveryCity})) > 0
      and ${t.deliveryCountryCode} is not null and ${t.deliveryCountryCode} ~ '^[A-Z]{2}$')
  )`,
    ),
    check('client_locale_valid', sql`${t.locale} in ('fr-MA', 'en-GB')`),
    check('client_version_positive', sql`${t.version} > 0`),
  ],
)
