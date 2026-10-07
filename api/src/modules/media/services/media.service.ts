import { createHash, randomUUID } from 'node:crypto'

import {
  type MediaAsset,
  type UploadMedia,
  UploadMediaSchema,
} from '../../../contracts/generated/media/media.schemas.js'
import type { ObjectStorage } from '../../../integrations/contracts.js'
import type { Transaction } from '../../../lib/db.js'
import { AppError } from '../../../lib/errors.js'
import { assertVersion } from '../../../lib/validation.js'
import { toMediaAsset } from '../mappers/media.mapper.js'
import type { createMediaRepository } from '../repositories/media.repository.js'
import { normalizeImage } from './image-policy.js'

type Purpose = MediaAsset['purpose']
const expiry = () => new Date(Date.now() + 24 * 60 * 60 * 1000)
const inUse = (refs: {
  company: boolean
  templates: boolean
  products: boolean
  documents?: boolean
}) => refs.company || refs.templates || refs.products || refs.documents === true

export function createMediaService(
  repo: ReturnType<typeof createMediaRepository>,
  storage: ObjectStorage,
) {
  function canUpload(purpose: Purpose, keys: string[]) {
    if (purpose === 'company_signature')
      return keys.includes('templates.create') || keys.includes('templates.update')
    if (purpose === 'company_logo')
      return (
        keys.includes('company_settings.update') ||
        keys.includes('templates.create') ||
        keys.includes('templates.update')
      )
    if (purpose === 'product_image')
      return keys.includes('products.create') || keys.includes('products.update')
    // Reserve template assets until their explicit attachment owner is implemented.
    return false
  }
  async function authorizeUpload(purpose: Purpose, actor: string, tx: Transaction) {
    if (!canUpload(purpose, await repo.permissions(actor, tx)))
      throw new AppError(403, 'FORBIDDEN', 'You cannot upload media for this purpose.')
  }
  async function readable(id: string, actor: string, tx: Transaction) {
    await repo.lock(tx)
    const row = await repo.get(id, tx)
    if (row.status !== 'ready') throw new AppError(404, 'MEDIA_NOT_FOUND', 'Media not available.')
    const refs = await repo.references(id, tx)
    const keys = await repo.permissions(actor, tx)
    const allowed = inUse(refs)
      ? ((refs.company && keys.includes('company_settings.read')) ||
          (refs.templates && keys.includes('templates.read')) ||
          (refs.products && keys.includes('products.read'))) &&
        (row.purpose !== 'company_signature' || keys.includes('templates.read'))
      : row.uploadedBy === actor &&
        canUpload(row.purpose, keys) &&
        !!row.expiresAt &&
        row.expiresAt > new Date()
    if (!allowed) throw new AppError(403, 'FORBIDDEN', 'You cannot access this media.')
    return row
  }
  return {
    // Internal PDF-worker capability only. IDs come from the persisted document
    // snapshot, never from a request; raw media HTTP authorization is unchanged.
    async documentImages(
      type: 'invoice' | 'estimate' | 'delivery_note' | 'payment_receipt',
      id: string,
      version: number,
      design: 'saved' | 'latest' = 'saved',
    ) {
      return repo.transaction(async (tx) => {
        await repo.lock(tx)
        const appearance = await repo.documentAppearance(type, id, version, tx, design)
        const load = async (assetId: unknown, purpose: Purpose) => {
          if (!assetId) return undefined
          if (typeof assetId !== 'string')
            throw new AppError(409, 'MEDIA_NOT_FOUND', 'Invalid document image.')
          const asset = await repo.get(assetId, tx)
          if (asset.status !== 'ready' || asset.purpose !== purpose)
            throw new AppError(409, 'MEDIA_NOT_FOUND', 'Document image is unavailable.')
          return storage.get(asset.objectKey)
        }
        return {
          appearance,
          logo: await load(appearance.logoAssetId, 'company_logo'),
          signature:
            appearance.showSignature === true
              ? await load(appearance.signatureAssetId, 'company_signature')
              : undefined,
        }
      })
    },
    async upload(input: UploadMedia, actor: string) {
      const data = UploadMediaSchema.parse(input)
      await repo.transaction(async (tx) => {
        await repo.lock(tx)
        await authorizeUpload(data.purpose, actor, tx)
      })
      const bytes = await normalizeImage(data)
      const id = randomUUID()
      const objectKey = `media/${id}.png`
      const originalFilename =
        // eslint-disable-next-line no-control-regex -- Strip control bytes from user-supplied metadata.
        data.originalFilename.replace(/[\\/\x00-\x1f\x7f]/g, '_').trim() || 'image'
      await repo.transaction(async (tx) => {
        await repo.lock(tx)
        await authorizeUpload(data.purpose, actor, tx)
        await repo.insert(
          {
            id,
            objectKey,
            originalFilename,
            contentType: 'image/png',
            byteSize: bytes.length,
            sha256: createHash('sha256').update(bytes).digest('hex'),
            purpose: data.purpose,
            uploadedBy: actor,
            expiresAt: expiry(),
          },
          tx,
        )
      })
      // Failed/ambiguous storage writes leave pending records for cleanup after the grace period.
      await storage.putImmutable({ key: objectKey, bytes, contentType: 'image/png' })
      return repo.transaction(async (tx) => {
        await repo.lock(tx)
        await authorizeUpload(data.purpose, actor, tx)
        const row = await repo.get(id, tx)
        if (row.status !== 'pending') throw new AppError(409, 'MEDIA_CONFLICT', 'Upload expired.')
        const ready = await repo.update(id, { status: 'ready' }, tx)
        await repo.audit(tx, actor, 'upload', id)
        return toMediaAsset(ready)
      })
    },
    get: (id: string, actor: string) =>
      repo.transaction(async (tx) => toMediaAsset(await readable(id, actor, tx))),
    async download(id: string, actor: string) {
      const row = await repo.transaction((tx) => readable(id, actor, tx))
      return storage.get(row.objectKey)
    },
    async assertAttach(tx: Transaction, id: string | null, purpose: Purpose, actor: string) {
      if (!id) return
      await repo.lock(tx)
      await authorizeUpload(purpose, actor, tx)
      const row = await readable(id, actor, tx)
      if (row.purpose !== purpose)
        throw new AppError(
          400,
          'MEDIA_PURPOSE_MISMATCH',
          'Select an image with the correct purpose.',
        )
      if (row.expiresAt) await repo.update(id, { expiresAt: null }, tx)
    },
    async release(tx: Transaction, ids: (string | null)[]) {
      await repo.lock(tx)
      for (const id of new Set(ids.filter((id): id is string => !!id))) {
        if (!inUse(await repo.references(id, tx)))
          await repo.update(id, { expiresAt: expiry() }, tx)
      }
    },
    async remove(id: string, expectedVersion: number, actor: string) {
      const row = await repo.transaction(async (tx) => {
        await repo.lock(tx)
        const asset = await repo.get(id, tx)
        await authorizeUpload(asset.purpose, actor, tx)
        if (asset.uploadedBy !== actor)
          throw new AppError(403, 'FORBIDDEN', 'Only the uploader can delete unattached media.')
        assertVersion(asset.version, expectedVersion)
        if (inUse(await repo.references(id, tx)))
          throw new AppError(
            409,
            'MEDIA_IN_USE',
            'Remove this image from its records before deleting it.',
          )
        if (!['ready', 'deleting'].includes(asset.status))
          throw new AppError(409, 'MEDIA_CONFLICT', 'Media cannot be deleted in its current state.')
        await repo.audit(tx, actor, 'delete_requested', id)
        return repo.update(id, { status: 'deleting' }, tx)
      })
      await storage.deleteUnreferenced(row.objectKey)
      await repo.transaction(async (tx) => {
        await repo.lock(tx)
        await repo.update(id, { status: 'deleted', deletedAt: new Date(), expiresAt: null }, tx)
      })
    },
  }
}
