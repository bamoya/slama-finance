import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { actors } from './actors.js'
import { mediaAssets } from './media.js'
import { organizationColumn, tenantPolicy } from './tenant.js'

const audit = () => ({
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdByActorId: uuid('created_by_actor_id').references(() => actors.id, {
    onDelete: 'set null',
  }),
  updatedByActorId: uuid('updated_by_actor_id').references(() => actors.id, {
    onDelete: 'set null',
  }),
})

export const productCategories = pgTable(
  'product_categories',
  {
    organizationId: organizationColumn(),
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...audit(),
  },
  (t) => [
    tenantPolicy(t.organizationId),
    uniqueIndex('product_categories_normalized_name_unique').on(
      t.organizationId,
      sql`lower(trim(${t.name}))`,
    ),
    check('category_name_nonblank', sql`length(trim(${t.name})) > 0`),
    check('category_version_positive', sql`${t.version} > 0`),
  ],
).enableRLS()

export const products = pgTable(
  'products',
  {
    organizationId: organizationColumn(),
    id: uuid('id').primaryKey().defaultRandom(),
    reference: text('reference').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    categoryId: uuid('category_id').references(() => productCategories.id, {
      onDelete: 'restrict',
    }),
    imageAssetId: uuid('image_asset_id').references(() => mediaAssets.id, { onDelete: 'restrict' }),
    suggestedVatRate: numeric('suggested_vat_rate', { precision: 5, scale: 2 }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...audit(),
  },
  (t) => [
    tenantPolicy(t.organizationId),
    uniqueIndex('products_reference_unique').on(t.organizationId, sql`lower(trim(${t.reference}))`),
    index('products_category_idx').on(t.organizationId, t.categoryId),
    check('product_name_nonblank', sql`length(trim(${t.name})) > 0`),
    check('product_reference_nonblank', sql`length(trim(${t.reference})) > 0`),
    check(
      'product_vat_range',
      sql`${t.suggestedVatRate} is null or (${t.suggestedVatRate} >= 0 and ${t.suggestedVatRate} <= 100)`,
    ),
    check('product_version_positive', sql`${t.version} > 0`),
  ],
).enableRLS()

export const productVariants = pgTable(
  'product_variants',
  {
    organizationId: organizationColumn(),
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    weightG: integer('weight_g').notNull(),
    pricePerItem: numeric('price_per_item', { precision: 18, scale: 2 }).notNull(),
    costPerItem: numeric('cost_per_item', { precision: 18, scale: 2 }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...audit(),
  },
  (t) => [
    tenantPolicy(t.organizationId),
    uniqueIndex('product_variants_product_weight_unique').on(
      t.organizationId,
      t.productId,
      t.weightG,
    ),
    index('product_variants_product_idx').on(t.organizationId, t.productId),
    check('variant_weight_positive', sql`${t.weightG} > 0`),
    check('variant_price_nonnegative', sql`${t.pricePerItem} >= 0`),
    check('variant_cost_nonnegative', sql`${t.costPerItem} is null or ${t.costPerItem} >= 0`),
    check('variant_version_positive', sql`${t.version} > 0`),
  ],
).enableRLS()
