import type { FastifyInstance, preHandlerHookHandler } from 'fastify'

import type { createCatalogController } from '../controllers/catalog.controller.js'
import type { createCatalogInsightsController } from '../controllers/catalog-insights.controller.js'

export function registerCatalogRoutes(
  app: FastifyInstance,
  c: ReturnType<typeof createCatalogController>,
  insights: ReturnType<typeof createCatalogInsightsController>,
  permission: (key: string) => preHandlerHookHandler,
) {
  app.get(
    '/categories/insights',
    { preHandler: permission('categories.read') },
    insights.categories,
  )
  app.get(
    '/categories/:id/insights',
    { preHandler: [permission('categories.read'), permission('products.read')] },
    insights.category,
  )
  app.get('/categories', { preHandler: permission('categories.read') }, c.categories)
  app.get('/categories/:id', { preHandler: permission('categories.read') }, c.category)
  app.post('/categories', { preHandler: permission('categories.create') }, c.createCategory)
  app.patch('/categories/:id', { preHandler: permission('categories.update') }, c.updateCategory)
  app.post(
    '/categories/:id/archive',
    { preHandler: permission('categories.update') },
    c.archiveCategory,
  )
  app.post(
    '/categories/:id/restore',
    { preHandler: permission('categories.update') },
    c.restoreCategory,
  )
  app.delete('/categories/:id', { preHandler: permission('categories.delete') }, c.deleteCategory)
  app.get('/products', { preHandler: permission('products.read') }, c.products)
  app.get('/products/insights', { preHandler: permission('products.read') }, insights.products)
  app.get('/products/:id/insights', { preHandler: permission('products.read') }, insights.product)
  app.get('/products/:id', { preHandler: permission('products.read') }, c.product)
  app.post('/products', { preHandler: permission('products.create') }, c.createProduct)
  app.patch('/products/:id', { preHandler: permission('products.update') }, c.updateProduct)
  app.post('/products/:id/archive', { preHandler: permission('products.update') }, c.archiveProduct)
  app.post('/products/:id/restore', { preHandler: permission('products.update') }, c.restoreProduct)
  app.delete('/products/:id', { preHandler: permission('products.delete') }, c.deleteProduct)
}
