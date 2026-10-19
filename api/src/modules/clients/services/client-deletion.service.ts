import type {
  ClientDeletionSelection,
  ConfirmClientDeletion,
} from '../../../contracts/generated/clients/deletion.schemas.js'
import type { Transaction } from '../../../lib/db.js'
import { AppError } from '../../../lib/errors.js'
import { createImpactConfirmation } from '../../../lib/impact-confirmation.js'
import { assertVersion } from '../../../lib/validation.js'
import type { SalesClientDeletionApi } from '../../sales/index.js'
import type { createClientRepository } from '../repositories/client.repository.js'
import { createClientDeletionRepository } from '../repositories/client-deletion.repository.js'

export function createClientDeletionService(
  repo: ReturnType<typeof createClientRepository>,
  sales: SalesClientDeletionApi,
) {
  const deletion = createClientDeletionRepository()
  const confirmation = createImpactConfirmation()
  async function graph(input: ClientDeletionSelection, actor: string, tx: Transaction) {
    await repo.authorize(tx, actor, 'clients.delete')
    await repo.authorize(tx, actor, 'clients.read')
    const ids = input.records.map((row) => row.id.toLowerCase()).sort()
    if (new Set(ids).size !== ids.length)
      throw new AppError(400, 'DUPLICATE_SELECTION', 'Select each record only once.')
    const state = await deletion.graph(ids, tx)
    for (const record of input.records) {
      const row = state.clients.find((row) => row.id === record.id.toLowerCase())
      if (!row) throw new AppError(404, 'RECORD_NOT_FOUND', 'A selected record no longer exists.')
      assertVersion(row.version, record.expectedVersion)
    }
    const salesImpact = await sales.preview(tx, ids, input.cascadeDocuments, actor)
    return { actor, ids, state, cascadeDocuments: input.cascadeDocuments, salesImpact }
  }
  return {
    preview(input: ClientDeletionSelection, actor: string) {
      return repo.transaction(async (tx) => {
        const value = await graph(input, actor, tx)
        return {
          ...value.salesImpact.impact,
          ...confirmation.issue(value),
          groups: [
            {
              resource: 'clients',
              operation: 'delete' as const,
              records: value.state.clients.map((row) => ({
                id: row.id,
                name: row.legalName ?? [row.firstName, row.lastName].filter(Boolean).join(' '),
              })),
            },
            ...value.salesImpact.impact.groups,
          ],
          requiredPermissions: [
            'clients.read',
            'clients.delete',
            ...value.salesImpact.impact.requiredPermissions,
          ],
        }
      })
    },
    async confirm(input: ConfirmClientDeletion, actor: string) {
      const files = await repo.transaction(async (tx) => {
        const value = await graph(input, actor, tx)
        confirmation.assert(input.token, value)
        const files = await sales.apply(
          tx,
          value.ids,
          input.cascadeDocuments,
          actor,
          value.salesImpact.fingerprint,
        )
        for (const row of value.state.clients)
          await repo.audit(tx, actor, row.id, 'delete', row, null)
        await deletion.remove(value.ids, tx)
        return files
      })
      await sales.cleanup(files)
    },
  }
}
