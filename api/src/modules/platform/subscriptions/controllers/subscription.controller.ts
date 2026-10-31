import type { FastifyReply, FastifyRequest } from 'fastify'

import {
  SubscriptionCancellationSchema,
  SubscriptionPaymentSubmissionSchema,
  SubscriptionQuoteRequestSchema,
} from '../../../../contracts/generated/subscriptions/subscriptions.schemas.js'
import type { createBillingService } from '../services/billing.service.js'
import type { createSubscriptionService } from '../services/subscription.service.js'
export function createSubscriptionController(
  service: ReturnType<typeof createSubscriptionService>,
  billing: ReturnType<typeof createBillingService>,
  owner: (token?: string) => Promise<{ id: string }>,
) {
  const id = async (request: FastifyRequest) =>
    (await owner(request.cookies.slama_owner_session)).id
  return {
    get: async (request: FastifyRequest) => service.summary(await id(request)),
    billing: async (request: FastifyRequest) => billing.catalog(await id(request)),
    quote: async (request: FastifyRequest) =>
      billing.quote(await id(request), SubscriptionQuoteRequestSchema.parse(request.body)),
    payments: async (request: FastifyRequest) => billing.payments(await id(request)),
    submit: async (request: FastifyRequest, reply: FastifyReply) =>
      reply
        .code(201)
        .send(
          await billing.submit(
            await id(request),
            SubscriptionPaymentSubmissionSchema.parse(request.body),
          ),
        ),
    cancellation: async (request: FastifyRequest) => {
      const ownerId = await id(request)
      await billing.setCancellation(
        ownerId,
        SubscriptionCancellationSchema.parse(request.body).cancelAtPeriodEnd,
      )
      return service.summary(ownerId)
    },
  }
}
