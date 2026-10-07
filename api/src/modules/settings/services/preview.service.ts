import sharp from 'sharp'

import {
  type CreateDocumentTemplate,
  CreateDocumentTemplateSchema,
  type PreviewDocumentTemplateQuery,
} from '../../../contracts/generated/settings/settings.schemas.js'
import type { MediaPublicApi } from '../../media/index.js'
import { renderTemplatePreview } from './template-html.js'

export function createPreviewService(media: MediaPublicApi) {
  return async (
    input: CreateDocumentTemplate,
    actor: string,
    kind: PreviewDocumentTemplateQuery['documentType'] = 'invoice',
    sampleSize: PreviewDocumentTemplateQuery['sampleSize'] = 'short',
  ) => {
    const data = CreateDocumentTemplateSchema.parse(input)
    const image = async (id: string | null) =>
      id
        ? await sharp(await media.download(id, actor))
            .resize({ width: 360, height: 180, fit: 'inside', withoutEnlargement: true })
            .png()
            .toBuffer()
        : undefined
    const logo = await image(data.logoAssetId)
    const signature = data.showSignature ? await image(data.signatureAssetId) : undefined
    return renderTemplatePreview(data, kind, { logo, signature }, sampleSize)
  }
}
