import type { FastifyRequest } from 'fastify'

import type { createSubscriptionService } from '../services/subscription.service.js'
export function createSubscriptionController(
  service: ReturnType<typeof createSubscriptionService>,
  owner: (token?: string) => Promise<{ id: string }>,
) {
  return {
    get: async (request: FastifyRequest) =>
      service.summary((await owner(request.cookies.slama_owner_session)).id),
  }
}
