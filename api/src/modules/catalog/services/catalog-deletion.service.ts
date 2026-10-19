import type {
  CatalogDeletionSelection,
  ConfirmCatalogDeletion,
} from '../../../contracts/generated/catalog/deletion.schemas.js'
import type { EntityDeletionImpact } from '../../../contracts/generated/shared/impact.schemas.js'
import type { Transaction } from '../../../lib/db.js'
import { AppError } from '../../../lib/errors.js'
import { createImpactConfirmation } from '../../../lib/impact-confirmation.js'
import { assertVersion } from '../../../lib/validation.js'
import type { MediaPublicApi } from '../../media/index.js'
import type { SalesCatalogDeletionApi } from '../../sales/index.js'
import type { createCatalogRepository } from '../repositories/catalog.repository.js'
import { createCatalogDeletionRepository } from '../repositories/catalog-deletion.repository.js'

export function createCatalogDeletionService(
  repo: ReturnType<typeof createCatalogRepository>,
  sales: SalesCatalogDeletionApi,
  media: MediaPublicApi,
) {
  const deletion = createCatalogDeletionRepository()
  const confirmation = createImpactConfirmation()
  async function graph(input: CatalogDeletionSelection, actor: string, tx: Transaction) {
    await repo.authorize(tx, actor, `${input.resource}.delete`)
    await repo.authorize(tx, actor, `${input.resource}.read`)
    if (input.resource !== 'categories' && input.cascadeProducts)
      throw new AppError(
        400,
        'INVALID_CASCADE',
        'Product cascade is available only for categories.',
      )
    const ids = input.records.map((row) => row.id.toLowerCase())
    if (new Set(ids).size !== ids.length)
      throw new AppError(400, 'DUPLICATE_SELECTION', 'Select each record only once.')
    const state = await deletion.graph(input, tx)
    const roots = input.resource === 'categories' ? state.categories : state.removed
    for (const selected of input.records) {
      const root = roots.find((row) => row.id === selected.id.toLowerCase())
      if (!root) throw new AppError(404, 'RECORD_NOT_FOUND', 'A selected record no longer exists.')
      assertVersion(root.version, selected.expectedVersion)
    }
    const groups: EntityDeletionImpact['groups'] = []
    const requiredPermissions = new Set([`${input.resource}.read`, `${input.resource}.delete`])
    const add = (
      resource: string,
      operation: 'delete' | 'detach',
      records: { id: string; name: string }[],
    ) => {
      if (records.length)
        groups.push({
          resource,
          operation,
          records: records.map((row) => ({ id: row.id, name: row.name })),
        })
    }
    add('categories', 'delete', state.categories)
    add('products', 'delete', state.removed)
    add('products', 'detach', state.detached)
    if (state.removed.length || state.detached.length)
      for (const key of [
        'products.read',
        `products.${state.removed.length ? 'delete' : 'update'}`,
      ]) {
        await repo.authorize(tx, actor, key)
        requiredPermissions.add(key)
      }
    const references = await sales.preview(
      tx,
      state.removed.map((row) => row.id),
      actor,
    )
    groups.push(...references.groups)
    references.requiredPermissions.forEach((key) => requiredPermissions.add(key))
    if (state.variants.length)
      groups.push({
        resource: 'product_variants',
        operation: 'delete',
        records: state.variants.map((row) => ({ id: row.id, name: `${row.weightG} g` })),
      })
    return {
      actor,
      resource: input.resource,
      cascadeProducts: input.cascadeProducts,
      state,
      references,
      groups,
      requiredPermissions: [...requiredPermissions].sort(),
    }
  }
  return {
    preview(input: CatalogDeletionSelection, actor: string) {
      return repo.transaction(async (tx) => {
        const state = await graph(input, actor, tx)
        return {
          ...confirmation.issue(state),
          groups: state.groups,
          requiredPermissions: state.requiredPermissions,
          blockers: [],
          media: new Set(
            state.state.removed.flatMap((row) => (row.imageAssetId ? [row.imageAssetId] : [])),
          ).size,
        }
      })
    },
    confirm(input: ConfirmCatalogDeletion, actor: string) {
      return repo.transaction(async (tx) => {
        const graphState = await graph(input, actor, tx)
        confirmation.assert(input.token, graphState)
        const { state } = graphState
        await sales.detach(
          tx,
          state.removed.map((row) => row.id),
          actor,
          graphState.references.fingerprint,
        )
        for (const row of state.categories)
          await repo.audit(tx, actor, 'product_categories', row.id, 'delete', row, null)
        for (const row of state.removed)
          await repo.audit(tx, actor, 'products', row.id, 'delete', row, null)
        for (const row of state.detached)
          await repo.audit(tx, actor, 'products', row.id, 'detach_category', row, {
            ...row,
            categoryId: null,
          })
        await deletion.remove(state, actor, tx)
        await media.release(
          tx,
          state.removed.map((row) => row.imageAssetId),
        )
      })
    },
  }
}
