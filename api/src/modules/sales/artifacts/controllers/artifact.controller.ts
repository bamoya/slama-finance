import type { FastifyReply, FastifyRequest } from 'fastify'

import {
  downloadArtifactParamsSchema,
  type RegeneratedDocumentPdf,
  type RegenerateDocumentPdfInput,
  RegenerateDocumentPdfInputSchema,
  type RegenerateDocumentPdfParams,
  regenerateDocumentPdfParamsSchema,
} from '../../../../contracts/generated/sales/artifacts.schemas.js'

interface DownloadService {
  download(
    id: string,
    actor: string,
  ): Promise<{
    artifact: { mimeType: string; documentType: string; id: string; format: string }
    bytes: Uint8Array
  }>
}

export function createArtifactController(
  service: DownloadService,
  regenerate: (
    params: RegenerateDocumentPdfParams,
    input: RegenerateDocumentPdfInput,
    actor: string,
  ) => Promise<RegeneratedDocumentPdf>,
) {
  return {
    regenerate(request: FastifyRequest) {
      return regenerate(
        regenerateDocumentPdfParamsSchema.parse(request.params),
        RegenerateDocumentPdfInputSchema.parse(request.body),
        request.actor!.userId,
      )
    },
    async download(request: FastifyRequest, reply: FastifyReply) {
      const { id } = downloadArtifactParamsSchema.parse(request.params)
      const { artifact, bytes } = await service.download(id, request.actor!.userId)
      return reply
        .header('content-type', artifact.mimeType)
        .header(
          'content-disposition',
          `attachment; filename="${artifact.documentType}-${artifact.id}.${artifact.format}"`,
        )
        .header('cache-control', 'private, no-store')
        .send(Buffer.from(bytes))
    },
  }
}
