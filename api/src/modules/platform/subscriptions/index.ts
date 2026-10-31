import type { FastifyInstance } from 'fastify'

import type { ObjectStorage } from '../../../integrations/contracts.js'
import type { Database } from '../../../lib/db.js'
import { createSubscriptionController } from './controllers/subscription.controller.js'
import { createBillingRepository } from './repositories/billing.repository.js'
import { createSubscriptionRepository } from './repositories/subscription.repository.js'
import { registerSubscriptionRoutes } from './routes/subscription.routes.js'
import { createBillingService } from './services/billing.service.js'
import { createMeteredStorage } from './services/metered-storage.service.js'
import { createSubscriptionService } from './services/subscription.service.js'
export type SubscriptionsPublicApi = ReturnType<typeof createSubscriptionService>
export function createSubscriptionsModule(database: () => Database) {
  const repo = createSubscriptionRepository(database),
    billingRepo = createBillingRepository(database)
  const service = createSubscriptionService(repo, billingRepo)
  const billing = createBillingService(billingRepo, repo)
  return {
    publicApi: service,
    /** Privileged operator actions; never exposed through owner or staff routes. */
    administration: {
      confirm: billing.confirm,
      reject: billing.reject,
      lifecycle: billing.administration,
    },
    storage: (storage: ObjectStorage) => createMeteredStorage(storage, service),
    async registerRoutes(app: FastifyInstance, owner: (token?: string) => Promise<{ id: string }>) {
      registerSubscriptionRoutes(app, createSubscriptionController(service, billing, owner))
    },
  }
}
