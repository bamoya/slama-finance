import { createHash } from 'node:crypto'

import { AppError } from '../../../../lib/errors.js'
import type { createInvoiceRepository } from '../../invoices/repositories/invoice.repository.js'
import { createSettingsReferenceRepository } from '../repositories/settings-reference.repository.js'
import type { SalesSettingsDeletionApi } from '../types/deletion.types.js'

export function createSettingsReferenceService(
  authority: ReturnType<typeof createInvoiceRepository>,
): SalesSettingsDeletionApi {
  const repo = createSettingsReferenceRepository()
  const preview: SalesSettingsDeletionApi['preview'] = async (tx, resource, ids, actor) => {
    const state = await repo.graph(tx, resource, ids)
    const groups = [],
      requiredPermissions = []
    for (const key of ['estimates', 'invoices', 'payments', 'delivery_notes'] as const) {
      if (!state[key].length) continue
      for (const action of ['read', 'update']) {
        const permission = `${key}.${action}`
        await authority.authorize(tx, actor, permission)
        requiredPermissions.push(permission)
      }
      groups.push({
        resource: key,
        operation: 'detach' as const,
        records: state[key].map((row) => ({ id: row.id, name: row.number })),
      })
    }
    return {
      fingerprint: createHash('sha256')
        .update(JSON.stringify({ state, resource, actor }))
        .digest('hex'),
      groups,
      requiredPermissions,
    }
  }
  return {
    preview,
    async detach(tx, resource, ids, actor, fingerprint) {
      if ((await preview(tx, resource, ids, actor)).fingerprint !== fingerprint)
        throw new AppError(409, 'IMPACT_CHANGED', 'The impact changed or expired. Review it again.')
      await repo.detach(tx, resource, await repo.graph(tx, resource, ids), actor)
    },
  }
}
