import type {
  RegenerateDocumentPdfInput,
  RegenerateDocumentPdfParams,
} from '../../../../contracts/generated/sales/artifacts.schemas.js'
import type { Transaction } from '../../../../lib/db.js'
import type { createArtifactSupport } from '../../../../support/artifacts/index.js'

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
    design: RegenerateDocumentPdfInput['design'],
  ) => Promise<Uint8Array>,
) {
  return async (params: Params, input: RegenerateDocumentPdfInput, actor: string) => {
    const repo = repos[params.documentType]
    const resource =
      params.documentType === 'delivery_note' ? 'delivery_notes' : `${params.documentType}s`
    const row = await repo.one(params.id)
    const result = await artifacts.regeneratePdf({
      type: params.documentType,
      documentId: params.id,
      sourceVersion: row.contentVersion,
      actor,
      design: input.design,
      authorize: async (tx) => {
        await repo.authorize(tx, actor, `${resource}.read`)
        await repo.authorize(tx, actor, `${resource}.update`)
      },
      render: () => render(params.documentType, params.id, row.contentVersion, input.design),
    })
    return { id: result.id, generatedAt: result.generatedAt.toISOString() }
  }
}
