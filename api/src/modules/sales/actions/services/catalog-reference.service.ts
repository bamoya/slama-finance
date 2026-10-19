import { createHash } from 'node:crypto'

import { AppError } from '../../../../lib/errors.js'
import type { createInvoiceRepository } from '../../invoices/repositories/invoice.repository.js'
import { createCatalogReferenceRepository } from '../repositories/catalog-reference.repository.js'
import type { SalesCatalogDeletionApi } from '../types/deletion.types.js'

export function createCatalogReferenceService(
  authority: ReturnType<typeof createInvoiceRepository>,
): SalesCatalogDeletionApi {
  const repo = createCatalogReferenceRepository()
  const preview: SalesCatalogDeletionApi['preview'] = async (tx, productIds, actor) => {
    const state = await repo.graph(tx, [...new Set(productIds)].sort())
    const groups = []
    const requiredPermissions = []
    for (const resource of ['estimates', 'invoices', 'delivery_notes'] as const) {
      if (!state[resource].length) continue
      for (const action of ['read', 'update']) {
        const key = `${resource}.${action}`
        await authority.authorize(tx, actor, key)
        requiredPermissions.push(key)
      }
      groups.push({
        resource,
        operation: 'detach' as const,
        records: state[resource].map((row) => ({ id: row.id, name: row.number })),
      })
    }
    return {
      fingerprint: createHash('sha256').update(JSON.stringify(state)).digest('hex'),
      groups,
      requiredPermissions,
    }
  }
  return {
    preview,
    async detach(tx, ids, actor, fingerprint) {
      if ((await preview(tx, ids, actor)).fingerprint !== fingerprint)
        throw new AppError(409, 'IMPACT_CHANGED', 'The impact changed or expired. Review it again.')
      await repo.detach(tx, ids, actor)
    },
  }
}
