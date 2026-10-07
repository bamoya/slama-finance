import { createHash, randomUUID } from 'node:crypto'

import type { ObjectStorage } from '../../../integrations/contracts.js'
import type { Transaction } from '../../../lib/db.js'
import { AppError } from '../../../lib/errors.js'
import type {
  Artifact,
  ArtifactInsert,
  createArtifactRepository,
} from '../repositories/artifact.repository.js'

export type DocumentType =
  'invoice' | 'estimate' | 'delivery_note' | 'report_run' | 'payment_receipt'

export interface ArtifactOwnerAccess {
  // Implemented by each business module. Must lock the owner while publishing.
  assertPublishable(tx: Transaction, type: DocumentType, id: string, version: number): Promise<void>
  assertReadable(tx: Transaction, type: DocumentType, id: string, actor: string): Promise<void>
  assertCurrent?(tx: Transaction, row: Artifact): Promise<void>
  published?(tx: Transaction, row: Artifact): Promise<void>
}

const MAX_PDF_BYTES = 8 * 1024 * 1024
const reportMime = (format: 'pdf' | 'csv' | 'xlsx') =>
  format === 'pdf'
    ? 'application/pdf'
    : format === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv; charset=utf-8'

export function createArtifactService(
  repo: ReturnType<typeof createArtifactRepository>,
  storage: ObjectStorage,
  owners: ArtifactOwnerAccess,
) {
  async function authorized(row: Artifact, actor: string) {
    await repo.transaction(async (tx) => {
      await owners.assertReadable(tx, row.documentType as DocumentType, row.documentId, actor)
      await owners.assertCurrent?.(tx, row)
    })
    return row
  }

  return {
    /** Owner holds its row lock for the entire restore. Missing files commit together. */
    async restoreReportFiles(
      tx: Transaction,
      id: string,
      actor: string,
      files: { format: 'pdf' | 'csv' | 'xlsx'; bytes: Uint8Array }[],
    ) {
      await owners.assertPublishable(tx, 'report_run', id, 1)
      for (const file of files) {
        if (await repo.findOwnerVersion('report_run', id, 1, file.format, tx)) continue
        if (!file.bytes.length || file.bytes.length > MAX_PDF_BYTES)
          throw new AppError(400, 'INVALID_REPORT_FILE', 'The report file is invalid or too large.')
        const key = `artifacts/report_run/${randomUUID()}.${file.format}`
        const mimeType = reportMime(file.format)
        await storage.putImmutable({ key, bytes: file.bytes, contentType: mimeType })
        // A rollback leaves only an orphan, handled by the existing maintenance worker.
        await repo.insertIfAbsent(
          {
            documentType: 'report_run',
            documentId: id,
            sourceVersion: 1,
            format: file.format,
            objectKey: key,
            mimeType,
            byteSize: file.bytes.length,
            sha256: createHash('sha256').update(file.bytes).digest('hex'),
            createdByUserId: actor,
          },
          tx,
        )
      }
    },
    async removeReleasedObjects(files: { objectKey: string; byteSize: number }[]) {
      const result = { removedFiles: 0, freedBytes: 0, retainedFiles: 0, pendingFiles: 0 }
      for (const file of files) {
        try {
          if (
            await repo.deleteIfUnreferenced(file.objectKey, () =>
              storage.deleteUnreferenced(file.objectKey),
            )
          ) {
            result.removedFiles++
            result.freedBytes += file.byteSize
          } else result.retainedFiles++
        } catch {
          result.pendingFiles++ // Durable fallback: orphan maintenance scans storage, not deleted rows.
        }
      }
      return result
    },
    async publishReportFile(input: {
      format?: 'csv' | 'xlsx'
      type: DocumentType
      documentId: string
      sourceVersion: number
      bytes: Uint8Array
      actor: string | null
      guard?: (tx: Transaction) => Promise<void>
    }) {
      const format = input.format ?? 'csv'
      if (
        input.type !== 'report_run' ||
        input.sourceVersion !== 1 ||
        !input.bytes.length ||
        input.bytes.length > MAX_PDF_BYTES
      )
        throw new AppError(400, 'INVALID_REPORT_FILE', 'The report file is invalid or too large.')
      const existing = await repo.transaction(async (tx) => {
        await input.guard?.(tx)
        await owners.assertPublishable(tx, input.type, input.documentId, input.sourceVersion)
        return repo.findOwnerVersion(input.type, input.documentId, input.sourceVersion, format, tx)
      })
      if (existing) return existing
      const key = `artifacts/report_run/${randomUUID()}.${format}`
      await storage.putImmutable({
        key,
        bytes: input.bytes,
        contentType: reportMime(format),
      })
      return repo.transaction(async (tx) => {
        await input.guard?.(tx)
        await owners.assertPublishable(tx, input.type, input.documentId, input.sourceVersion)
        const inserted = await repo.insertIfAbsent(
          {
            documentType: input.type,
            documentId: input.documentId,
            sourceVersion: 1,
            format,
            objectKey: key,
            mimeType: reportMime(format),
            byteSize: input.bytes.length,
            sha256: createHash('sha256').update(input.bytes).digest('hex'),
            createdByUserId: input.actor,
          },
          tx,
        )
        const result =
          inserted ?? (await repo.findOwnerVersion(input.type, input.documentId, 1, format, tx))
        if (!result) throw new AppError(409, 'ARTIFACT_CONFLICT', 'Report file was not published.')
        return result
      })
    },
    async regeneratePdf(input: {
      type: DocumentType
      documentId: string
      sourceVersion: number
      actor: string
      design: 'saved' | 'latest'
      authorize: (tx: Transaction) => Promise<void>
      render: () => Promise<Uint8Array>
    }) {
      const previous = await repo.transaction(async (tx) => {
        await input.authorize(tx)
        await owners.assertPublishable(tx, input.type, input.documentId, input.sourceVersion)
        if (input.type === 'payment_receipt')
          return (await repo.listByOwner(input.type, input.documentId, tx)).at(-1) ?? null
        return repo.findOwnerVersion(input.type, input.documentId, input.sourceVersion, 'pdf', tx)
      })
      let bytes: Uint8Array
      try {
        bytes = await input.render()
      } catch (error) {
        if (error instanceof AppError) throw error
        throw new AppError(
          503,
          'PDF_REGENERATION_FAILED',
          'PDF generation failed. The previous file is unchanged.',
        )
      }
      if (
        bytes.length < 8 ||
        bytes.length > MAX_PDF_BYTES ||
        Buffer.from(bytes.subarray(0, 5)).toString('ascii') !== '%PDF-'
      )
        throw new AppError(400, 'INVALID_PDF', 'The generated PDF is invalid or too large.')
      const key = `artifacts/${input.type}/${randomUUID()}.pdf`
      try {
        await storage.putImmutable({ key, bytes, contentType: 'application/pdf' })
      } catch {
        throw new AppError(
          503,
          'PDF_REGENERATION_FAILED',
          'PDF storage failed. The previous file is unchanged.',
        )
      }
      // Failed candidates remain unreferenced for grace-period cleanup; never remove the current PDF.
      return await repo.transaction(async (tx) => {
        await input.authorize(tx)
        await owners.assertPublishable(tx, input.type, input.documentId, input.sourceVersion)
        const data: ArtifactInsert = {
          documentType: input.type,
          documentId: input.documentId,
          sourceVersion: input.sourceVersion,
          format: 'pdf',
          objectKey: key,
          mimeType: 'application/pdf',
          byteSize: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          createdByUserId: input.actor,
        }
        const next = previous
          ? await repo.replace(previous, data, tx)
          : await repo.insertIfAbsent(data, tx)
        if (!next)
          throw new AppError(
            409,
            'ARTIFACT_CONFLICT',
            'Another PDF was published. Reload and retry.',
          )
        await repo.auditRegeneration(previous, next, input.design, tx)
        await owners.published?.(tx, next)
        return next
      })
    },
    async publishPdf(input: {
      type: DocumentType
      documentId: string
      sourceVersion: number
      bytes: Uint8Array
      actor: string | null
      guard?: (tx: Transaction) => Promise<void>
    }) {
      const { type, documentId, sourceVersion, bytes, actor } = input
      if (!Number.isInteger(sourceVersion) || sourceVersion < 1)
        throw new AppError(400, 'INVALID_VERSION', 'Invalid printable content version.')
      if (
        bytes.length < 8 ||
        bytes.length > MAX_PDF_BYTES ||
        Buffer.from(bytes.subarray(0, 5)).toString('ascii') !== '%PDF-'
      )
        throw new AppError(400, 'INVALID_PDF', 'The generated PDF is invalid or too large.')

      // Validate before I/O, then recheck under the publishing transaction.
      const existing = await repo.transaction(async (tx) => {
        await input.guard?.(tx)
        await owners.assertPublishable(tx, type, documentId, sourceVersion)
        return repo.findOwnerVersion(type, documentId, sourceVersion, 'pdf', tx)
      })
      if (existing) return existing

      const id = randomUUID()
      const key = `artifacts/${type}/${id}.pdf`
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      await storage.putImmutable({ key, bytes, contentType: 'application/pdf' })

      // A worker crash between upload and commit can leave an orphan. The artifact
      // cleanup worker must remove only unreferenced objects after a grace period.
      let published: Artifact | null
      try {
        published = await repo.transaction(async (tx) => {
          await input.guard?.(tx)
          await owners.assertPublishable(tx, type, documentId, sourceVersion)
          const inserted = await repo.insertIfAbsent(
            {
              id,
              documentType: type,
              documentId,
              sourceVersion,
              format: 'pdf',
              objectKey: key,
              mimeType: 'application/pdf',
              byteSize: bytes.length,
              sha256,
              createdByUserId: actor,
            },
            tx,
          )
          const result =
            inserted ?? (await repo.findOwnerVersion(type, documentId, sourceVersion, 'pdf', tx))
          if (result) await owners.published?.(tx, result)
          return result
        })
      } catch (error) {
        try {
          await repo.deleteIfUnreferenced(key, () => storage.deleteUnreferenced(key))
        } catch {
          // A crash or failed delete leaves an orphan for storage maintenance.
        }
        throw error
      }
      if (!published) {
        await repo.deleteIfUnreferenced(key, () => storage.deleteUnreferenced(key))
        throw new AppError(409, 'ARTIFACT_CONFLICT', 'Document file was not published.')
      }
      // This invocation lost a concurrent race. Its key cannot be referenced by
      // the winning artifact, so it is safe to remove; retry cleanup on failure.
      if (published.id !== id) {
        try {
          await repo.deleteIfUnreferenced(key, () => storage.deleteUnreferenced(key))
        } catch {
          // Orphan cleanup is handled by the storage maintenance worker.
        }
      }
      return published
    },
    async get(id: string, actor: string) {
      return authorized(await repo.get(id), actor)
    },
    async list(type: DocumentType, documentId: string, actor: string) {
      return repo.transaction(async (tx) => {
        await owners.assertReadable(tx, type, documentId, actor)
        return repo.listByOwner(type, documentId, tx)
      })
    },
    async download(id: string, actor: string) {
      const row = await authorized(await repo.get(id), actor)
      const bytes = await storage.get(row.objectKey)
      // A collection/cancellation may happen during storage I/O.
      if (row.documentType === 'payment_receipt') await authorized(row, actor)
      return { artifact: row, bytes }
    },
  }
}
