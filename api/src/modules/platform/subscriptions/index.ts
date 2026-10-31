import type { FastifyInstance } from 'fastify'

import type { ObjectStorage } from '../../../integrations/contracts.js'
import type { Database } from '../../../lib/db.js'
import { createSubscriptionController } from './controllers/subscription.controller.js'
import { createSubscriptionRepository } from './repositories/subscription.repository.js'
import { registerSubscriptionRoutes } from './routes/subscription.routes.js'
import { createMeteredStorage } from './services/metered-storage.service.js'
import { createSubscriptionService } from './services/subscription.service.js'
export type SubscriptionsPublicApi = ReturnType<typeof createSubscriptionService>
export function createSubscriptionsModule(database: () => Database) {
  const service = createSubscriptionService(createSubscriptionRepository(database))
  return {
    publicApi: service,
    storage: (storage: ObjectStorage) => createMeteredStorage(storage, service),
    async registerRoutes(
      app: FastifyInstance,
      owner: (token?: string) => Promise<{ id: string }>,
      origin?: string,
    ) {
      registerSubscriptionRoutes(app, createSubscriptionController(service, owner), origin)
    },
  }
}
