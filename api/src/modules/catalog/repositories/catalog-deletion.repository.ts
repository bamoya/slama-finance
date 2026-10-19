import { asc, eq, inArray, sql } from 'drizzle-orm'

import { productCategories, products, productVariants } from '../../../../db/schema/catalog.js'
import type { CatalogDeletionSelection } from '../../../contracts/generated/catalog/deletion.schemas.js'
import type { Transaction } from '../../../lib/db.js'

export function createCatalogDeletionRepository() {
  return {
    async graph(input: CatalogDeletionSelection, tx: Transaction) {
      const ids = input.records.map((row) => row.id.toLowerCase()).sort()
      const categories =
        input.resource === 'categories'
          ? await tx
              .select()
              .from(productCategories)
              .where(inArray(productCategories.id, ids))
              .orderBy(asc(productCategories.id))
              .for('update')
          : []
      const affected = await tx
        .select()
        .from(products)
        .where(
          input.resource === 'products'
            ? inArray(products.id, ids)
            : inArray(products.categoryId, ids),
        )
        .orderBy(asc(products.id))
        .for('update')
      const removed = input.resource === 'products' || input.cascadeProducts ? affected : []
      const detached = input.resource === 'categories' && !input.cascadeProducts ? affected : []
      const variants = removed.length
        ? await tx
            .select()
            .from(productVariants)
            .where(
              inArray(
                productVariants.productId,
                removed.map((row) => row.id),
              ),
            )
            .orderBy(asc(productVariants.id))
            .for('update')
        : []
      return { categories, removed, detached, variants }
    },
    async remove(
      state: {
        categories: { id: string }[]
        removed: { id: string }[]
        detached: { id: string }[]
      },
      actor: string,
      tx: Transaction,
    ) {
      const ids = state.detached.map((row) => row.id)
      if (ids.length)
        await tx
          .update(products)
          .set({
            categoryId: null,
            version: sql`${products.version} + 1`,
            updatedAt: new Date(),
            updatedByUserId: actor,
          })
          .where(inArray(products.id, ids))
      for (const row of state.removed) await tx.delete(products).where(eq(products.id, row.id))
      if (state.categories.length)
        await tx.delete(productCategories).where(
          inArray(
            productCategories.id,
            state.categories.map((row) => row.id),
          ),
        )
    },
  }
}
