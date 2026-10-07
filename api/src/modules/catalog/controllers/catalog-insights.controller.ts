import type { FastifyRequest } from 'fastify'

import {
  getCategoryInsightsParamsSchema,
  getCategoryInsightsQuerySchema,
  getProductInsightsParamsSchema,
  getProductInsightsQuerySchema,
  listCategoryInsightsQuerySchema,
  listProductInsightsQuerySchema,
} from '../../../contracts/generated/catalog/catalog.schemas.js'
import type { createCatalogInsightsService } from '../services/catalog-insights.service.js'

export function createCatalogInsightsController(
  service: ReturnType<typeof createCatalogInsightsService>,
) {
  return {
    products: (request: FastifyRequest) =>
      service.listProducts(
        listProductInsightsQuerySchema.parse(request.query),
        request.actor!.userId,
      ),
    product: (request: FastifyRequest) =>
      service.product(
        getProductInsightsParamsSchema.parse(request.params).id,
        getProductInsightsQuerySchema.parse(request.query),
        request.actor!.userId,
      ),
    categories: (request: FastifyRequest) =>
      service.listCategories(
        listCategoryInsightsQuerySchema.parse(request.query),
        request.actor!.userId,
      ),
    category: (request: FastifyRequest) =>
      service.category(
        getCategoryInsightsParamsSchema.parse(request.params).id,
        getCategoryInsightsQuerySchema.parse(request.query),
        request.actor!.userId,
      ),
  }
}
