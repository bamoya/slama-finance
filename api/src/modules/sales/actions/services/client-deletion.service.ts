import { createHash } from 'node:crypto'

import type { Transaction } from '../../../../lib/db.js'
import { AppError } from '../../../../lib/errors.js'
import type { createArtifactSupport } from '../../../../support/artifacts/index.js'
import type { createInvoiceRepository } from '../../invoices/repositories/invoice.repository.js'
import { clientSnapshot } from '../../shared/services/client-snapshot.js'
import { createDeletionRepository } from '../repositories/deletion.repository.js'
import type { SalesClientDeletionApi } from '../types/deletion.types.js'

export function createSalesClientDeletionService(
  authority: ReturnType<typeof createInvoiceRepository>,
  artifacts: ReturnType<typeof createArtifactSupport>['service'],
): SalesClientDeletionApi {
  const repo = createDeletionRepository()
  async function graph(tx: Transaction, ids: string[], cascade: boolean, actor: string) {
    const state = await repo.clientGraph(ids, tx, cascade)
    const clients = await repo.clientRows(ids, tx)
    const groups = []
    const requiredPermissions = []
    for (const resource of ['estimates', 'invoices', 'delivery_notes', 'payments'] as const) {
      const rows = state.removed[resource]
      if (!rows.length || (!cascade && resource === 'payments')) continue
      for (const action of ['read', cascade ? 'delete' : 'update']) {
        const key = `${resource}.${action}`
        await authority.authorize(tx, actor, key)
        requiredPermissions.push(key)
      }
      groups.push({
        resource,
        operation: cascade ? ('delete' as const) : ('detach' as const),
        records: rows.map((row) => ({ id: row.id, name: row.number })),
      })
    }
    if (cascade)
      for (const [resource, rows] of [
        ['estimates', state.detachedEstimates],
        ['invoices', state.detachedInvoices],
      ] as const) {
        if (!rows.length) continue
        for (const action of ['read', 'update']) {
          const key = `${resource}.${action}`
          await authority.authorize(tx, actor, key)
          requiredPermissions.push(key)
        }
        groups.push({
          resource,
          operation: 'detach' as const,
          records: rows.map((row) => ({ id: row.id, name: row.number })),
        })
      }
    const files = cascade ? [...state.files, ...state.attachments] : state.attachments
    const retainedKeys = new Set(
      [
        ...state.references.files,
        ...state.references.attachments,
        ...(!cascade ? state.files : []),
      ].map((row) => row.objectKey),
    )
    const keys = new Set(files.map((row) => row.objectKey))
    const impact = {
      groups,
      requiredPermissions: [...new Set(requiredPermissions)].sort(),
      media: 0,
      blockers: state.messages.some((row) => row.status === 'sending')
        ? ['EMAIL_DELIVERY_IN_PROGRESS']
        : [],
      files: [...keys].filter((key) => !retainedKeys.has(key)).length,
      retainedFiles: new Set([
        ...[...keys].filter((key) => retainedKeys.has(key)),
        ...(!cascade ? state.files.map((row) => row.objectKey) : []),
      ]).size,
      jobs: state.jobs.filter(
        (row) =>
          ['queued', 'running'].includes(row.status) &&
          (cascade || row.jobType === 'prepare_notification'),
      ).length,
      emails: state.messages.filter((row) => row.status === 'queued').length,
    }
    return {
      state,
      clients,
      files,
      impact,
      fingerprint: createHash('sha256')
        .update(JSON.stringify({ state, clients, cascade, actor }))
        .digest('hex'),
    }
  }
  return {
    async preview(tx, ids, cascade, actor) {
      const value = await graph(tx, ids, cascade, actor)
      return { fingerprint: value.fingerprint, impact: value.impact }
    },
    async apply(tx, ids, cascade, actor, fingerprint) {
      const value = await graph(tx, ids, cascade, actor)
      if (value.fingerprint !== fingerprint)
        throw new AppError(409, 'IMPACT_CHANGED', 'The impact changed or expired. Review it again.')
      if (value.impact.blockers.length)
        throw new AppError(
          409,
          'EMAIL_DELIVERY_IN_PROGRESS',
          'An email is being sent. Wait for delivery to finish, then review again.',
        )
      if (cascade) await repo.remove(value.state, actor, tx)
      else
        await repo.detachClients(
          value.state,
          new Map(value.clients.map((client) => [client.id, clientSnapshot(client)])),
          actor,
          tx,
        )
      return [
        ...new Map(
          value.files.map((file) => [
            file.objectKey,
            { objectKey: file.objectKey, byteSize: file.byteSize },
          ]),
        ).values(),
      ]
    },
    cleanup: (files) => artifacts.removeReleasedObjects(files),
  }
}
