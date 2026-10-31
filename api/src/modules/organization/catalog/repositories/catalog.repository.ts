import { and, asc, eq, ilike, isNotNull, isNull, or, sql } from 'drizzle-orm'

import { productCategories, products, productVariants } from '../../../../../db/schema/catalog.js'
import { auditEvents } from '../../../../../db/schema/settings.js'
import { requireActorPermission } from '../../../../lib/actor-permissions.js'
import type { Database, Transaction } from '../../../../lib/db.js'
import { AppError } from '../../../../lib/errors.js'

type CategoryFields = Pick<typeof productCategories.$inferInsert, 'name' | 'description'>
type ProductFields = Pick<
  typeof products.$inferInsert,
  'reference' | 'name' | 'description' | 'categoryId' | 'imageAssetId' | 'suggestedVatRate'
>

export function createCatalogRepository(database: () => Database) {
  return {
    transaction: <T>(work: (tx: Transaction) => Promise<T>) => database().transaction(work),
    authorize: requireActorPermission,
    listCategories(q: string, status: string) {
      return database()
        .select()
        .from(productCategories)
        .where(
          and(
            q ? ilike(productCategories.name, `%${q}%`) : undefined,
            status === 'active'
              ? isNull(productCategories.archivedAt)
              : status === 'archived'
                ? isNotNull(productCategories.archivedAt)
                : undefined,
          ),
        )
        .orderBy(asc(productCategories.name))
    },
    async category(id: string, tx: Database | Transaction = database()) {
      const [row] = await tx.select().from(productCategories).where(eq(productCategories.id, id))
      if (!row) throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Category not found.')
      return row
    },
    async insertCategory(fields: CategoryFields, actor: string, tx: Transaction) {
      const [row] = await tx
        .insert(productCategories)
        .values({ ...fields, createdByActorId: actor, updatedByActorId: actor })
        .returning()
      return row!
    },
    async updateCategory(
      id: string,
      fields: Partial<CategoryFields> & { archivedAt?: Date | null },
      actor: string,
      tx: Transaction,
    ) {
      const [row] = await tx
        .update(productCategories)
        .set({
          ...fields,
          version: sql`${productCategories.version} + 1`,
          updatedAt: new Date(),
          updatedByActorId: actor,
        })
        .where(eq(productCategories.id, id))
        .returning()
      return row!
    },
    deleteCategory: (id: string, tx: Transaction) =>
      tx.delete(productCategories).where(eq(productCategories.id, id)),
    listProducts(q: string, status: string, categoryId?: string) {
      return database()
        .select()
        .from(products)
        .where(
          and(
            q ? or(ilike(products.name, `%${q}%`), ilike(products.reference, `%${q}%`)) : undefined,
            status === 'active'
              ? isNull(products.archivedAt)
              : status === 'archived'
                ? isNotNull(products.archivedAt)
                : undefined,
            categoryId ? eq(products.categoryId, categoryId) : undefined,
          ),
        )
        .orderBy(asc(products.name))
    },
    async product(id: string, tx: Database | Transaction = database()) {
      const [row] = await tx.select().from(products).where(eq(products.id, id))
      if (!row) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found.')
      return row
    },
    variants(productId: string, tx: Database | Transaction = database()) {
      return tx
        .select()
        .from(productVariants)
        .where(eq(productVariants.productId, productId))
        .orderBy(asc(productVariants.weightG))
    },
    async insertProduct(fields: ProductFields, actor: string, tx: Transaction) {
      const [row] = await tx
        .insert(products)
        .values({ ...fields, createdByActorId: actor, updatedByActorId: actor })
        .returning()
      return row!
    },
    async updateProduct(
      id: string,
      fields: Partial<ProductFields> & { archivedAt?: Date | null },
      actor: string,
      tx: Transaction,
    ) {
      const [row] = await tx
        .update(products)
        .set({
          ...fields,
          version: sql`${products.version} + 1`,
          updatedAt: new Date(),
          updatedByActorId: actor,
        })
        .where(eq(products.id, id))
        .returning()
      return row!
    },
    deleteProduct: (id: string, tx: Transaction) => tx.delete(products).where(eq(products.id, id)),
    async insertVariant(
      productId: string,
      data: { weightG: number; pricePerItem: string; costPerItem: string | null; active: boolean },
      actor: string,
      tx: Transaction,
    ) {
      const [row] = await tx
        .insert(productVariants)
        .values({
          productId,
          weightG: data.weightG,
          pricePerItem: data.pricePerItem,
          costPerItem: data.costPerItem,
          archivedAt: data.active ? null : new Date(),
          createdByActorId: actor,
          updatedByActorId: actor,
        })
        .returning()
      return row!
    },
    async updateVariant(
      id: string,
      fields: { pricePerItem?: string; costPerItem?: string | null; archivedAt?: Date | null },
      actor: string,
      tx: Transaction,
    ) {
      const [row] = await tx
        .update(productVariants)
        .set({
          ...fields,
          version: sql`${productVariants.version} + 1`,
          updatedAt: new Date(),
          updatedByActorId: actor,
        })
        .where(eq(productVariants.id, id))
        .returning()
      return row!
    },
    audit: (
      tx: Transaction,
      actor: string,
      entity: 'product_categories' | 'products',
      id: string,
      action: string,
      before: unknown,
      after: unknown,
    ) =>
      tx.insert(auditEvents).values({
        actorId: actor,
        actorKind: 'user',
        entityTable: entity,
        entityKey: { id },
        action,
        beforeValues: before ? JSON.parse(JSON.stringify(before)) : null,
        afterValues: after ? JSON.parse(JSON.stringify(after)) : null,
      }),
  }
}
