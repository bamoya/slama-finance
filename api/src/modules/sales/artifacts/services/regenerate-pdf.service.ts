import type {
  RegenerateDocumentPdfInput,
  RegenerateDocumentPdfParams,
} from '../../../../contracts/generated/sales/artifacts.schemas.js'
import type { Transaction } from '../../../../lib/db.js'
import type { createArtifactSupport } from '../../../../support/artifacts/index.js'
import {
  type RenderedDesign,
  saveDocumentDesign,
} from '../../shared/repositories/document-design.repository.js'

type Params = Omit<RegenerateDocumentPdfParams, 'documentType'> & {
  documentType: Exclude<RegenerateDocumentPdfParams['documentType'], 'payment_receipt'>
}
type Source = { contentVersion: number }
interface SourceRepository {
  one(id: string): Promise<Source>
  authorize(tx: Transaction, actor: string, key: string): Promise<void>
}

export function createRegeneratePdfService(
  repos: Record<Params['documentType'], SourceRepository>,
  artifacts: ReturnType<typeof createArtifactSupport>['service'],
  render: (
    type: Params['documentType'],
    id: string,
    version: number,
    design: 'saved' | 'latest',
    templateId?: string | null,
  ) => Promise<{ bytes: Uint8Array; design: RenderedDesign }>,
) {
  return async (params: Params, input: RegenerateDocumentPdfInput, actor: string) => {
    const repo = repos[params.documentType]
    const resource =
      params.documentType === 'delivery_note' ? 'delivery_notes' : `${params.documentType}s`
    const row = await repo.one(params.id)
    let renderedDesign: RenderedDesign
    const result = await artifacts.regeneratePdf({
      type: params.documentType,
      documentId: params.id,
      sourceVersion: row.contentVersion,
      actor,
      design: 'latest',
      authorize: async (tx) => {
        await repo.authorize(tx, actor, `${resource}.read`)
        await repo.authorize(tx, actor, `${resource}.update`)
        if (input.templateId) await repo.authorize(tx, actor, 'templates.read')
      },
      render: async () => {
        const result = await render(
          params.documentType,
          params.id,
          row.contentVersion,
          'latest',
          input.templateId,
        )
        renderedDesign = result.design
        return result.bytes
      },
      onPublish: (tx) =>
        saveDocumentDesign(tx, params.documentType, params.id, actor, renderedDesign),
    })
    return { id: result.id, generatedAt: result.generatedAt.toISOString() }
  }
}
