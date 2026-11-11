import type { FastifyReply, FastifyRequest } from 'fastify'

import {
  BillingCustomerSchema,
  downloadOwnerSubscriptionInvoicePdfParamsSchema,
  downloadOwnerSubscriptionInvoicePdfQuerySchema,
  listOwnerSubscriptionInvoicesQuerySchema,
  SubscriptionCancellationSchema,
  SubscriptionPaymentSubmissionSchema,
  SubscriptionQuoteRequestSchema,
} from '../../../../contracts/generated/subscriptions/subscriptions.schemas.js'
import type { createBillingService } from '../services/billing.service.js'
import { renderBillingInvoicePdf } from '../services/billing-invoice-pdf.service.js'
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
    saveCustomer: async (request: FastifyRequest) =>
      billing.saveCustomer(await id(request), BillingCustomerSchema.parse(request.body)),
    quote: async (request: FastifyRequest) =>
      billing.quote(await id(request), SubscriptionQuoteRequestSchema.parse(request.body)),
    payments: async (request: FastifyRequest) => billing.payments(await id(request)),
    invoices: async (request: FastifyRequest) =>
      billing.invoices(
        await id(request),
        listOwnerSubscriptionInvoicesQuerySchema.parse(request.query).page,
      ),
    async invoicePdf(request: FastifyRequest, reply: FastifyReply) {
      const { invoiceId } = downloadOwnerSubscriptionInvoicePdfParamsSchema.parse(request.params)
      const { language } = downloadOwnerSubscriptionInvoicePdfQuerySchema.parse(request.query)
      const file = await renderBillingInvoicePdf(
        await billing.ownerInvoice(await id(request), invoiceId),
        language as 'fr' | 'en',
      )
      return reply
        .type('application/pdf')
        .header('Content-Disposition', `attachment; filename="${file.filename}"`)
        .send(Buffer.from(file.bytes))
    },
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
