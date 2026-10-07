import sharp from 'sharp'

import type { UploadMedia } from '../../../contracts/generated/media/media.schemas.js'
import { AppError } from '../../../lib/errors.js'

export async function normalizeImage(data: UploadMedia) {
  const bytes = Buffer.from(data.data, 'base64')
  if (bytes.length > 2 * 1024 * 1024)
    throw new AppError(413, 'ASSET_TOO_LARGE', 'Images must be at most 2 MiB.')
  if (bytes.toString('base64') !== data.data)
    throw new AppError(400, 'INVALID_IMAGE', 'Invalid image encoding.')
  let clean: Buffer
  try {
    const image = sharp(bytes, { limitInputPixels: 16_000_000, failOn: 'warning' })
    const meta = await image.metadata()
    if (
      `image/${meta.format}` !== data.contentType ||
      !['png', 'jpeg', 'webp'].includes(meta.format ?? '') ||
      (meta.pages ?? 1) !== 1
    )
      throw new Error('Unsupported image')
    clean = await image
      .rotate()
      .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer()
  } catch {
    throw new AppError(
      400,
      'INVALID_IMAGE',
      'Upload a valid, non-animated PNG, JPEG or WebP image (at most 16 megapixels).',
    )
  }
  if (clean.length > 8 * 1024 * 1024)
    throw new AppError(413, 'ASSET_TOO_LARGE', 'The normalized image is too large.')
  return clean
}
