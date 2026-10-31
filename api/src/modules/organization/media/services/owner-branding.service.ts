import { createHash, randomUUID } from 'node:crypto'

import type { UploadMedia } from '../../../../contracts/generated/media/media.schemas.js'
import type { ObjectStorage } from '../../../../integrations/contracts.js'
import { AppError } from '../../../../lib/errors.js'
import type { createOwnerBrandingRepository } from '../repositories/owner-branding.repository.js'
import { normalizeImage } from './image-policy.js'

export function createOwnerBrandingService(
  repository: ReturnType<typeof createOwnerBrandingRepository>,
  storage: ObjectStorage,
) {
  return {
    async prepareWorkspace(
      ownerId: string,
      organizationId: string,
      ids: (string | null | undefined)[],
    ) {
      const images = []
      for (const id of ids.filter((id): id is string => !!id)) {
        const asset = await repository.get(ownerId, organizationId, id)
        const bytes = await storage.get(asset.objectKey),
          key = `organizations/${organizationId}/media/${id}.png`
        try {
          await storage.putImmutable({ key, bytes, contentType: 'image/png' })
        } catch (error) {
          const existing = await storage.get(key).catch(() => null)
          if (
            !existing ||
            createHash('sha256').update(existing).digest('hex') !==
              createHash('sha256').update(bytes).digest('hex')
          )
            throw error
        }
        images.push({
          id,
          organizationId,
          objectKey: key,
          originalFilename: asset.purpose + '.png',
          contentType: 'image/png',
          byteSize: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          purpose: asset.purpose,
          status: 'ready' as const,
        })
      }
      return images
    },
    attachWorkspace: repository.attachWorkspace,
    async upload(ownerId: string, organizationId: string, input: UploadMedia) {
      if (!['company_logo', 'company_signature'].includes(input.purpose))
        throw new AppError(400, 'VALIDATION_ERROR', 'Invalid brand image purpose.')
      const bytes = await normalizeImage(input)
      const id = randomUUID(),
        key = `organizations/${organizationId}/branding/${id}.png`
      await storage.putImmutable({ key, bytes, contentType: 'image/png' })
      try {
        await repository.insert(ownerId, {
          id,
          organizationId,
          objectKey: key,
          purpose: input.purpose as 'company_logo' | 'company_signature',
          byteSize: bytes.length,
        })
      } catch (error) {
        await storage.deleteUnreferenced(key).catch(() => {})
        throw error
      }
      return { id, purpose: input.purpose }
    },
    async assert(ownerId: string, organizationId: string, id: string, purpose: string) {
      const asset = await repository.get(ownerId, organizationId, id)
      if (asset.purpose !== purpose)
        throw new AppError(400, 'INVALID_MEDIA_PURPOSE', 'Invalid image purpose.')
    },
    async image(ownerId: string, organizationId: string, id: string) {
      const asset = await repository.get(ownerId, organizationId, id)
      return {
        id: asset.id,
        purpose: asset.purpose,
        data: Buffer.from(await storage.get(asset.objectKey)).toString('base64'),
      }
    },
  }
}
