import { sql } from 'drizzle-orm'
import { bigint, check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { users } from './auth.js'

export const mediaAssets = pgTable(
  'media_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    objectKey: text('object_key').notNull().unique(),
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
    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    check('media_size', sql`${t.byteSize} > 0 and ${t.byteSize} <= 8388608`),
    check('media_hash', sql`${t.sha256} ~ '^[a-f0-9]{64}$'`),
    check('media_version', sql`${t.version} > 0`),
    check(
      'media_purpose',
      sql`${t.purpose} in ('company_logo','company_signature','product_image','template_asset')`,
    ),
    check('media_status', sql`${t.status} in ('pending','ready','deleting','deleted')`),
    index('media_cleanup_idx').on(t.status, t.expiresAt),
  ],
)
