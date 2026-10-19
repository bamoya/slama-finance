import type { FastifyInstance, preHandlerHookHandler } from 'fastify'

import type { Database } from '../../lib/db.js'
import type { MediaPublicApi } from '../media/index.js'
import type { SalesCatalogDeletionApi } from '../sales/index.js'
import { createCatalogController } from './controllers/catalog.controller.js'
import { createCatalogDeletionController } from './controllers/catalog-deletion.controller.js'
import { createCatalogInsightsController } from './controllers/catalog-insights.controller.js'
import { createCatalogRepository } from './repositories/catalog.repository.js'
import { createCatalogInsightsRepository } from './repositories/catalog-insights.repository.js'
import { registerCatalogRoutes } from './routes/catalog.routes.js'
import { registerCatalogDeletionRoutes } from './routes/catalog-deletion.routes.js'
import { createCatalogService } from './services/catalog.service.js'
import { createCatalogDeletionService } from './services/catalog-deletion.service.js'
import { createCatalogInsightsService } from './services/catalog-insights.service.js'

export function createCatalogModule(
  database: () => Database,
  media: MediaPublicApi,
  sales: SalesCatalogDeletionApi,
) {
  const service = createCatalogService(createCatalogRepository(database), media)
  const insights = createCatalogInsightsService(createCatalogInsightsRepository(database))
  const deletion = createCatalogDeletionService(createCatalogRepository(database), sales, media)
  return {
    publicApi: { getProduct: service.getProduct, getCategory: service.getCategory },
    async registerRoutes(app: FastifyInstance, permission: (key: string) => preHandlerHookHandler) {
      await app.register(
        async (scope) => {
          registerCatalogRoutes(
            scope,
            createCatalogController(service),
            createCatalogInsightsController(insights),
            permission,
          )
          registerCatalogDeletionRoutes(
            scope,
            createCatalogDeletionController(deletion),
            permission,
          )
        },
        { prefix: '/v1' },
      )
    },
  }
}
