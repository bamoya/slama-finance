import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { users } from './auth.js'

export const documentArtifacts = pgTable(
  'document_artifacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentType: text('document_type').notNull(),
    documentId: uuid('document_id').notNull(),
    sourceVersion: integer('source_version').notNull(),
    format: text('format').notNull(),
    objectKey: text('object_key').notNull().unique(),
    mimeType: text('mime_type').notNull(),
    byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
    sha256: text('sha256').notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [
    uniqueIndex('document_artifacts_owner_version_format_uq').on(
      t.documentType,
      t.documentId,
      t.sourceVersion,
      t.format,
    ),
    index('document_artifacts_owner_idx').on(t.documentType, t.documentId),
    check(
      'document_artifacts_type',
      sql`${t.documentType} in ('invoice', 'estimate', 'delivery_note', 'report_run', 'payment_receipt')`,
    ),
    check('document_artifacts_version', sql`${t.sourceVersion} > 0`),
    check(
      'document_artifacts_format',
      sql`${t.format} in ('pdf', 'csv', 'xlsx') and (${t.format} <> 'xlsx' or ${t.documentType} = 'report_run')`,
    ),
    check('document_artifacts_size', sql`${t.byteSize} > 0 and ${t.byteSize} <= 8388608`),
    check('document_artifacts_hash', sql`${t.sha256} ~ '^[a-f0-9]{64}$'`),
  ],
)
