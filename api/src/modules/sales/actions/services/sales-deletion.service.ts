import type {
  ConfirmSalesDeletion,
  SalesDeletionImpact,
  SalesDeletionSelection,
} from '../../../../contracts/generated/sales/actions.schemas.js'
import type { Transaction } from '../../../../lib/db.js'
import { AppError } from '../../../../lib/errors.js'
import { createImpactConfirmation } from '../../../../lib/impact-confirmation.js'
import { assertVersion } from '../../../../lib/validation.js'
import type { createArtifactSupport } from '../../../../support/artifacts/index.js'
import type { createInvoiceRepository } from '../../invoices/repositories/invoice.repository.js'
import { createDeletionRepository } from '../repositories/deletion.repository.js'

export function createSalesDeletionService(
  invoices: ReturnType<typeof createInvoiceRepository>,
  artifacts: ReturnType<typeof createArtifactSupport>['service'],
) {
  const repo = createDeletionRepository()
  const confirmation = createImpactConfirmation()
  async function graph(input: SalesDeletionSelection, actor: string, tx: Transaction) {
    await invoices.authorize(tx, actor, `${input.resource}.delete`)
    if (input.cascadeInvoices && input.resource !== 'estimates')
      throw new AppError(400, 'INVALID_CASCADE', 'Invoice cascade is available only for estimates.')
    const ids = input.records.map((row) => row.id.toLowerCase())
    if (new Set(ids).size !== ids.length)
      throw new AppError(400, 'DUPLICATE_SELECTION', 'Select each record only once.')
    const state = await repo.graph(input, tx)
    for (const selected of input.records) {
      const row = state.removed[input.resource].find(
        (record) => record.id === selected.id.toLowerCase(),
      )
      if (!row) throw new AppError(404, 'RECORD_NOT_FOUND', 'A selected record no longer exists.')
      assertVersion(row.version, selected.expectedVersion)
    }
    const groups: SalesDeletionImpact['groups'] = []
    const item = (row: { id: string; number: string | null; version: number; status: string }) => ({
      id: row.id,
      name: row.number,
      version: row.version,
      status: row.status,
    })
    for (const resource of ['estimates', 'invoices', 'delivery_notes', 'payments'] as const) {
      const rows = state.removed[resource]
      if (!rows.length) continue
      await invoices.authorize(tx, actor, `${resource}.read`)
      await invoices.authorize(tx, actor, `${resource}.delete`)
      groups.push({ resource, operation: 'delete', records: rows.map(item) })
    }
    for (const [resource, rows] of [
      ['estimates', state.detachedEstimates],
      ['invoices', state.detachedInvoices],
    ] as const) {
      if (!rows.length) continue
      await invoices.authorize(tx, actor, `${resource}.read`)
      await invoices.authorize(tx, actor, `${resource}.update`)
      groups.push({ resource, operation: 'detach', records: rows.map(item) })
    }
    return {
      actor,
      action: 'delete_sales',
      resource: input.resource,
      cascadeInvoices: input.cascadeInvoices,
      state,
      groups,
    }
  }
  return {
    preview(input: SalesDeletionSelection, actor: string) {
      return invoices.transaction(async (tx) => {
        const impact = await graph(input, actor, tx)
        const { state, groups } = impact
        const retained = new Set(
          [...state.references.files, ...state.references.attachments].map((row) => row.objectKey),
        )
        const keys = new Set([...state.files, ...state.attachments].map((row) => row.objectKey))
        const blockers: SalesDeletionImpact['blockers'] = state.messages.some(
          (row) => row.status === 'sending',
        )
          ? ['EMAIL_DELIVERY_IN_PROGRESS']
          : []
        return {
          ...confirmation.issue(impact),
          groups,
          requiredPermissions: [
            ...new Set(
              groups.flatMap((group) => [
                `${group.resource}.read`,
                `${group.resource}.${group.operation === 'delete' ? 'delete' : 'update'}`,
              ]),
            ),
          ].sort(),
          files: [...keys].filter((key) => !retained.has(key)).length,
          retainedFiles: retained.size,
          jobs: state.jobs.filter((row) => ['queued', 'running'].includes(row.status)).length,
          emails: state.messages.filter((row) => row.status === 'queued').length,
          blockers,
        }
      })
    },
    async confirm(input: ConfirmSalesDeletion, actor: string) {
      const files = await invoices.transaction(async (tx) => {
        const impact = await graph(input, actor, tx)
        confirmation.assert(input.token, impact)
        if (impact.state.messages.some((row) => row.status === 'sending'))
          throw new AppError(
            409,
            'EMAIL_DELIVERY_IN_PROGRESS',
            'An email is being sent. Wait for delivery to finish, then review again.',
          )
        await repo.remove(impact.state, actor, tx)
        return [
          ...new Map(
            [...impact.state.files, ...impact.state.attachments].map((file) => [
              file.objectKey,
              { objectKey: file.objectKey, byteSize: file.byteSize },
            ]),
          ).values(),
        ]
      })
      // Only unreferenced generated artifacts are removed. Shared brand media are untouched.
      // Failed storage deletion is retried by the existing durable orphan-maintenance scan.
      await artifacts.removeReleasedObjects(files)
    },
  }
}
