import {
  type CategoryInput,
  CategoryInputSchema,
  CategorySchema,
  type CategoryUpdate,
  CategoryUpdateSchema,
  type ProductInput,
  ProductInputSchema,
  ProductSchema,
  type ProductUpdate,
  ProductUpdateSchema,
  type VariantInput,
} from '../../../contracts/generated/catalog/catalog.schemas.js'
import { AppError } from '../../../lib/errors.js'
import { assertVersion } from '../../../lib/validation.js'
import type { MediaPublicApi } from '../../media/index.js'
import type { createCatalogRepository } from '../repositories/catalog.repository.js'

const dto = <T>(schema: { parse(value: unknown): T }, value: unknown): T =>
  schema.parse(JSON.parse(JSON.stringify(value)))
const trimmed = (value: string) => value.trim()
function active(row: { archivedAt: Date | null }) {
  if (row.archivedAt)
    throw new AppError(409, 'RECORD_ARCHIVED', 'Restore this record before editing it.')
}
function checkVariants(variants: VariantInput[]) {
  if (!variants.some((v) => v.active))
    throw new AppError(400, 'VARIANT_REQUIRED', 'Keep at least one active variant.')
  if (new Set(variants.map((v) => v.weightG)).size !== variants.length)
    throw new AppError(400, 'DUPLICATE_VARIANT_WEIGHT', 'Each variant needs a different weight.')
  if (
    new Set(variants.filter((v) => v.id).map((v) => v.id)).size !==
    variants.filter((v) => v.id).length
  )
    throw new AppError(400, 'DUPLICATE_VARIANT', 'A variant can appear only once.')
}

export function createCatalogService(
  repo: ReturnType<typeof createCatalogRepository>,
  media: MediaPublicApi,
) {
  async function fullProduct(
    row: Awaited<ReturnType<typeof repo.product>>,
    tx?: Parameters<typeof repo.variants>[1],
  ) {
    return dto(ProductSchema, { ...row, variants: await repo.variants(row.id, tx) })
  }
  async function categoryForNew(id: string | null, tx: Parameters<typeof repo.category>[1]) {
    if (id) active(await repo.category(id, tx))
  }
  return {
    listCategories: async (q: string, status: string) =>
      Promise.all((await repo.listCategories(q, status)).map((r) => dto(CategorySchema, r))),
    getCategory: async (id: string) => dto(CategorySchema, await repo.category(id)),
    createCategory(input: CategoryInput, actor: string) {
      const data = CategoryInputSchema.parse(input)
      const name = trimmed(data.name)
      if (!name) throw new AppError(400, 'VALIDATION_ERROR', 'Category name is required.')
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'categories.create')
        const row = await repo.insertCategory(
          { name, description: data.description?.trim() || null },
          actor,
          tx,
        )
        await repo.audit(tx, actor, 'product_categories', row.id, 'create', null, row)
        return dto(CategorySchema, row)
      })
    },
    updateCategory(id: string, input: CategoryUpdate, actor: string) {
      const data = CategoryUpdateSchema.parse(input)
      const name = trimmed(data.name)
      if (!name) throw new AppError(400, 'VALIDATION_ERROR', 'Category name is required.')
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'categories.update')
        const before = await repo.category(id, tx)
        active(before)
        assertVersion(before.version, data.expectedVersion)
        const after = await repo.updateCategory(
          id,
          { name, description: data.description?.trim() || null },
          actor,
          tx,
        )
        await repo.audit(tx, actor, 'product_categories', id, 'update', before, after)
        return dto(CategorySchema, after)
      })
    },
    changeCategoryStatus(id: string, expectedVersion: number, actor: string, restore: boolean) {
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, restore ? 'categories.update' : 'categories.update')
        const before = await repo.category(id, tx)
        assertVersion(before.version, expectedVersion)
        if (restore ? !before.archivedAt : !!before.archivedAt)
          throw new AppError(409, 'INVALID_STATUS', 'Category already has this status.')
        const after = await repo.updateCategory(
          id,
          { archivedAt: restore ? null : new Date() },
          actor,
          tx,
        )
        await repo.audit(
          tx,
          actor,
          'product_categories',
          id,
          restore ? 'restore' : 'archive',
          before,
          after,
        )
        return dto(CategorySchema, after)
      })
    },
    deleteCategory(id: string, expectedVersion: number, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'categories.delete')
        const before = await repo.category(id, tx)
        assertVersion(before.version, expectedVersion)
        await repo.deleteCategory(id, tx)
        await repo.audit(tx, actor, 'product_categories', id, 'delete', before, null)
      })
    },
    listProducts: async (q: string, status: string, categoryId?: string) =>
      Promise.all((await repo.listProducts(q, status, categoryId)).map((r) => fullProduct(r))),
    getProduct: async (id: string) => fullProduct(await repo.product(id)),
    createProduct(input: ProductInput, actor: string) {
      const data = ProductInputSchema.parse(input)
      const reference = trimmed(data.reference),
        name = trimmed(data.name)
      if (!reference || !name)
        throw new AppError(400, 'VALIDATION_ERROR', 'Name and reference are required.')
      if (data.variants.some((v) => v.id || !v.active))
        throw new AppError(
          400,
          'INVALID_VARIANT',
          'New variants must be active and cannot specify an ID.',
        )
      checkVariants(data.variants)
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'products.create')
        await categoryForNew(data.categoryId, tx)
        await media.assertAttach(tx, data.imageAssetId, 'product_image', actor)
        const row = await repo.insertProduct(
          {
            reference,
            name,
            description: data.description?.trim() || null,
            categoryId: data.categoryId,
            imageAssetId: data.imageAssetId,
            suggestedVatRate: data.suggestedVatRate,
          },
          actor,
          tx,
        )
        for (const variant of data.variants) await repo.insertVariant(row.id, variant, actor, tx)
        const after = await fullProduct(row, tx)
        await repo.audit(tx, actor, 'products', row.id, 'create', null, after)
        return after
      })
    },
    updateProduct(id: string, input: ProductUpdate, actor: string) {
      const data = ProductUpdateSchema.parse(input)
      const reference = trimmed(data.reference),
        name = trimmed(data.name)
      if (!reference || !name)
        throw new AppError(400, 'VALIDATION_ERROR', 'Name and reference are required.')
      checkVariants(data.variants)
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'products.update')
        const before = await repo.product(id, tx)
        active(before)
        assertVersion(before.version, data.expectedVersion)
        const previous = await fullProduct(before, tx)
        if (data.categoryId !== before.categoryId) await categoryForNew(data.categoryId, tx)
        if (data.imageAssetId !== before.imageAssetId)
          await media.assertAttach(tx, data.imageAssetId, 'product_image', actor)
        const existing = await repo.variants(id, tx)
        const byId = new Map(existing.map((v) => [v.id, v]))
        for (const variant of data.variants) {
          if (!variant.id) {
            if (!variant.active)
              throw new AppError(400, 'INVALID_VARIANT', 'New variants must be active.')
            if (existing.some((v) => v.weightG === variant.weightG))
              throw new AppError(
                409,
                'VARIANT_WEIGHT_EXISTS',
                'Restore or edit the existing weight variant.',
              )
            await repo.insertVariant(id, variant, actor, tx)
            continue
          }
          const old = byId.get(variant.id)
          if (!old)
            throw new AppError(400, 'INVALID_VARIANT', 'Variant does not belong to this product.')
          if (variant.weightG !== old.weightG)
            throw new AppError(
              409,
              'IMMUTABLE_VARIANT_WEIGHT',
              'Create a new variant to change package weight.',
            )
          if (
            old.pricePerItem !== variant.pricePerItem ||
            old.costPerItem !== variant.costPerItem ||
            !!old.archivedAt === variant.active
          )
            await repo.updateVariant(
              old.id,
              {
                pricePerItem: variant.pricePerItem,
                costPerItem: variant.costPerItem,
                archivedAt: variant.active ? null : new Date(),
              },
              actor,
              tx,
            )
        }
        const supplied = new Set(data.variants.map((v) => v.id).filter(Boolean))
        for (const old of existing)
          if (!supplied.has(old.id) && !old.archivedAt)
            await repo.updateVariant(old.id, { archivedAt: new Date() }, actor, tx)
        const afterRow = await repo.updateProduct(
          id,
          {
            reference,
            name,
            description: data.description?.trim() || null,
            categoryId: data.categoryId,
            imageAssetId: data.imageAssetId,
            suggestedVatRate: data.suggestedVatRate,
          },
          actor,
          tx,
        )
        await media.release(tx, [before.imageAssetId])
        const after = await fullProduct(afterRow, tx)
        await repo.audit(tx, actor, 'products', id, 'update', previous, after)
        return after
      })
    },
    changeProductStatus(id: string, expectedVersion: number, actor: string, restore: boolean) {
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, restore ? 'products.update' : 'products.update')
        const before = await repo.product(id, tx)
        assertVersion(before.version, expectedVersion)
        if (restore ? !before.archivedAt : !!before.archivedAt)
          throw new AppError(409, 'INVALID_STATUS', 'Product already has this status.')
        const after = await repo.updateProduct(
          id,
          { archivedAt: restore ? null : new Date() },
          actor,
          tx,
        )
        await repo.audit(tx, actor, 'products', id, restore ? 'restore' : 'archive', before, after)
        return fullProduct(after, tx)
      })
    },
    deleteProduct(id: string, expectedVersion: number, actor: string) {
      return repo.transaction(async (tx) => {
        await repo.authorize(tx, actor, 'products.delete')
        const before = await repo.product(id, tx)
        assertVersion(before.version, expectedVersion)
        await repo.deleteProduct(id, tx)
        await media.release(tx, [before.imageAssetId])
        await repo.audit(tx, actor, 'products', id, 'delete', before, null)
      })
    },
  }
}
