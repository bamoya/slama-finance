import { and, eq, inArray, sql } from 'drizzle-orm'

import { documentArtifacts } from '../../../../db/schema/artifacts.js'
import { outboundMessageAttachments } from '../../../../db/schema/notifications.js'
import { auditEvents } from '../../../../db/schema/settings.js'
import type { Database, Transaction } from '../../../lib/db.js'
import { AppError } from '../../../lib/errors.js'

export type Artifact = typeof documentArtifacts.$inferSelect
export type ArtifactInsert = typeof documentArtifacts.$inferInsert

export function createArtifactRepository(database: () => Database) {
  return {
    transaction: <T>(work: (tx: Transaction) => Promise<T>) => database().transaction(work),
    async findOwnerVersion(
      type: string,
      documentId: string,
      sourceVersion: number,
      format: string,
      tx: Database | Transaction = database(),
    ) {
      const [row] = await tx
        .select()
        .from(documentArtifacts)
        .where(
          and(
            eq(documentArtifacts.documentType, type),
            eq(documentArtifacts.documentId, documentId),
            eq(documentArtifacts.sourceVersion, sourceVersion),
            eq(documentArtifacts.format, format),
          ),
        )
      return row ?? null
    },
    async get(id: string, tx: Database | Transaction = database()) {
      const [row] = await tx.select().from(documentArtifacts).where(eq(documentArtifacts.id, id))
      if (!row) throw new AppError(404, 'ARTIFACT_NOT_FOUND', 'Document file not found.')
      return row
    },
    listByOwner(type: string, documentId: string, tx: Database | Transaction = database()) {
      return tx
        .select()
        .from(documentArtifacts)
        .where(
          and(
            eq(documentArtifacts.documentType, type),
            eq(documentArtifacts.documentId, documentId),
          ),
        )
        .orderBy(documentArtifacts.generatedAt)
    },
    async referencedKeys(keys: string[], tx: Database | Transaction = database()) {
      if (!keys.length) return new Set<string>()
      const rows = await tx
        .select({ key: documentArtifacts.objectKey })
        .from(documentArtifacts)
        .where(inArray(documentArtifacts.objectKey, keys))
      const attachments = await tx
        .select({ key: outboundMessageAttachments.objectKey })
        .from(outboundMessageAttachments)
        .where(inArray(outboundMessageAttachments.objectKey, keys))
      return new Set([...rows, ...attachments].map((row) => row.key))
    },
    async deleteIfUnreferenced(key: string, remove: () => Promise<void>) {
      return database().transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 91036))`)
        if ((await this.referencedKeys([key], tx)).has(key)) return false
        await remove()
        return true
      })
    },
    async insertIfAbsent(data: ArtifactInsert, tx: Transaction) {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${data.objectKey}, 91036))`,
      )
      const [row] = await tx
        .insert(documentArtifacts)
        .values(data)
        .onConflictDoNothing()
        .returning()
      return row ?? null
    },
    async replace(previous: Artifact, data: ArtifactInsert, tx: Transaction) {
      for (const key of [previous.objectKey, data.objectKey].sort())
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 91036))`)
      const [row] = await tx
        .update(documentArtifacts)
        .set({
          sourceVersion: data.sourceVersion,
          objectKey: data.objectKey,
          byteSize: data.byteSize,
          sha256: data.sha256,
          generatedAt: new Date(),
          createdByUserId: data.createdByUserId,
        })
        .where(
          and(
            eq(documentArtifacts.id, previous.id),
            eq(documentArtifacts.objectKey, previous.objectKey),
          ),
        )
        .returning()
      if (!row)
        throw new AppError(409, 'ARTIFACT_CONFLICT', 'Another PDF was published. Reload and retry.')
      return row
    },
    async auditRegeneration(
      previous: Artifact | null,
      next: Artifact,
      design: string,
      tx: Transaction,
    ) {
      await tx.insert(auditEvents).values({
        actorUserId: next.createdByUserId,
        actorKind: 'user',
        action: 'regenerate_pdf',
        entityTable: 'document_artifacts',
        entityKey: { id: next.id },
        beforeValues: previous ? { objectKey: previous.objectKey, sha256: previous.sha256 } : null,
        afterValues: { objectKey: next.objectKey, sha256: next.sha256, design },
      })
    },
  }
}
