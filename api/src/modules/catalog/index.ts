import type { FastifyInstance, preHandlerHookHandler } from 'fastify'

import type { Database } from '../../lib/db.js'
import type { MediaPublicApi } from '../media/index.js'
import { createCatalogController } from './controllers/catalog.controller.js'
import { createCatalogInsightsController } from './controllers/catalog-insights.controller.js'
import { createCatalogRepository } from './repositories/catalog.repository.js'
import { createCatalogInsightsRepository } from './repositories/catalog-insights.repository.js'
import { registerCatalogRoutes } from './routes/catalog.routes.js'
import { createCatalogService } from './services/catalog.service.js'
import { createCatalogInsightsService } from './services/catalog-insights.service.js'

export function createCatalogModule(database: () => Database, media: MediaPublicApi) {
  const service = createCatalogService(createCatalogRepository(database), media)
  const insights = createCatalogInsightsService(createCatalogInsightsRepository(database))
  return {
    publicApi: { getProduct: service.getProduct, getCategory: service.getCategory },
    async registerRoutes(app: FastifyInstance, permission: (key: string) => preHandlerHookHandler) {
      await app.register(
        async (scope) =>
          registerCatalogRoutes(
            scope,
            createCatalogController(service),
            createCatalogInsightsController(insights),
            permission,
          ),
        { prefix: '/v1' },
      )
    },
  }
}
