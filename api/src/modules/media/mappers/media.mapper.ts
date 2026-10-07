import { MediaAssetSchema } from '../../../contracts/generated/media/media.schemas.js'

export function toMediaAsset(row: object) {
  const { objectKey: _key, sha256: _hash, ...visible } = row as Record<string, unknown>
  return MediaAssetSchema.parse(JSON.parse(JSON.stringify(visible)))
}
