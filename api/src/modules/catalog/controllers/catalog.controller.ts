import type { FastifyReply, FastifyRequest } from 'fastify'

import {
  CatalogRecordVersionSchema,
  CategoryInputSchema,
  CategoryUpdateSchema,
  getCategoryParamsSchema,
  getProductParamsSchema,
  listCategoriesQuerySchema,
  listProductsQuerySchema,
  ProductInputSchema,
  ProductUpdateSchema,
} from '../../../contracts/generated/catalog/catalog.schemas.js'
import type { createCatalogService } from '../services/catalog.service.js'

export function createCatalogController(service: ReturnType<typeof createCatalogService>) {
  return {
    categories: (r: FastifyRequest) => {
      const { q, status } = listCategoriesQuerySchema.parse(r.query)
      return service.listCategories(q ?? '', status)
    },
    category: (r: FastifyRequest) =>
      service.getCategory(getCategoryParamsSchema.parse(r.params).id),
    async createCategory(r: FastifyRequest, reply: FastifyReply) {
      return reply
        .code(201)
        .send(await service.createCategory(CategoryInputSchema.parse(r.body), r.actor!.userId))
    },
    updateCategory: (r: FastifyRequest) =>
      service.updateCategory(
        getCategoryParamsSchema.parse(r.params).id,
        CategoryUpdateSchema.parse(r.body),
        r.actor!.userId,
      ),
    archiveCategory: (r: FastifyRequest) =>
      service.changeCategoryStatus(
        getCategoryParamsSchema.parse(r.params).id,
        CatalogRecordVersionSchema.parse(r.body).expectedVersion,
        r.actor!.userId,
        false,
      ),
    restoreCategory: (r: FastifyRequest) =>
      service.changeCategoryStatus(
        getCategoryParamsSchema.parse(r.params).id,
        CatalogRecordVersionSchema.parse(r.body).expectedVersion,
        r.actor!.userId,
        true,
      ),
    async deleteCategory(r: FastifyRequest, reply: FastifyReply) {
      await service.deleteCategory(
        getCategoryParamsSchema.parse(r.params).id,
        CatalogRecordVersionSchema.parse(r.body).expectedVersion,
        r.actor!.userId,
      )
      return reply.code(204).send()
    },
    products: (r: FastifyRequest) => {
      const { q, status, categoryId } = listProductsQuerySchema.parse(r.query)
      return service.listProducts(q ?? '', status, categoryId)
    },
    product: (r: FastifyRequest) => service.getProduct(getProductParamsSchema.parse(r.params).id),
    async createProduct(r: FastifyRequest, reply: FastifyReply) {
      return reply
        .code(201)
        .send(await service.createProduct(ProductInputSchema.parse(r.body), r.actor!.userId))
    },
    updateProduct: (r: FastifyRequest) =>
      service.updateProduct(
        getProductParamsSchema.parse(r.params).id,
        ProductUpdateSchema.parse(r.body),
        r.actor!.userId,
      ),
    archiveProduct: (r: FastifyRequest) =>
      service.changeProductStatus(
        getProductParamsSchema.parse(r.params).id,
        CatalogRecordVersionSchema.parse(r.body).expectedVersion,
        r.actor!.userId,
        false,
      ),
    restoreProduct: (r: FastifyRequest) =>
      service.changeProductStatus(
        getProductParamsSchema.parse(r.params).id,
        CatalogRecordVersionSchema.parse(r.body).expectedVersion,
        r.actor!.userId,
        true,
      ),
    async deleteProduct(r: FastifyRequest, reply: FastifyReply) {
      await service.deleteProduct(
        getProductParamsSchema.parse(r.params).id,
        CatalogRecordVersionSchema.parse(r.body).expectedVersion,
        r.actor!.userId,
      )
      return reply.code(204).send()
    },
  }
}
