import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  index,
  integer,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { actors } from './actors.js'
import { organizations } from './organizations.js'
import { organizationColumn, tenantPolicy } from './tenant.js'

export const mediaAssets = pgTable(
  'media_assets',
  {
    organizationId: organizationColumn(),
    id: uuid('id').primaryKey().defaultRandom(),
    objectKey: text('object_key').notNull(),
    originalFilename: text('original_filename').notNull(),
    contentType: text('content_type').notNull(),
    byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
    sha256: text('sha256').notNull(),
    purpose: text('purpose', {
      enum: ['company_logo', 'company_signature', 'product_image', 'template_asset'],
    }).notNull(),
    status: text('status', { enum: ['pending', 'ready', 'deleting', 'deleted'] })
      .notNull()
      .default('pending'),
    uploadedBy: uuid('uploaded_by').references(() => actors.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    tenantPolicy(t.organizationId),
    check(
      'media_storage_scope',
      sql`starts_with(${t.objectKey}, 'organizations/' || ${t.organizationId}::text || '/media/')`,
    ),
    uniqueIndex('media_assets_objectKey_tenant_unique').on(t.organizationId, t.objectKey),
    check('media_size', sql`${t.byteSize} > 0 and ${t.byteSize} <= 8388608`),
    check('media_hash', sql`${t.sha256} ~ '^[a-f0-9]{64}$'`),
    check('media_version', sql`${t.version} > 0`),
    check(
      'media_purpose',
      sql`${t.purpose} in ('company_logo','company_signature','product_image','template_asset')`,
    ),
    check('media_status', sql`${t.status} in ('pending','ready','deleting','deleted')`),
    index('media_cleanup_idx').on(t.organizationId, t.status, t.expiresAt),
  ],
).enableRLS()

// Owner onboarding assets use owner policies before finance activation.
export const organizationBrandAssets = pgTable(
  'organization_brand_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    objectKey: text('object_key').notNull().unique(),
    purpose: text('purpose', { enum: ['company_logo', 'company_signature'] }).notNull(),
    byteSize: integer('byte_size').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('organization_brand_size', sql`${t.byteSize}>0 and ${t.byteSize}<=8388608`),
    check('organization_brand_purpose', sql`${t.purpose} in ('company_logo','company_signature')`),
    pgPolicy('organization_brand_owner', {
      for: 'all',
      using: sql`current_setting('app.actor_type',true)='owner' and exists(select 1 from organizations o where o.id=${t.organizationId} and o.owner_id=nullif(current_setting('app.owner_id',true),'')::uuid)`,
      withCheck: sql`current_setting('app.actor_type',true)='owner' and exists(select 1 from organizations o where o.id=${t.organizationId} and o.owner_id=nullif(current_setting('app.owner_id',true),'')::uuid)`,
    }),
  ],
).enableRLS()
