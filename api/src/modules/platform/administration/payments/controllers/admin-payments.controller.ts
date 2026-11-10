import type { FastifyReply, FastifyRequest } from 'fastify'

import {
  AdminCreditNoteRequestSchema,
  AdminPaymentConfirmationSchema,
  AdminPaymentRejectionSchema,
  confirmAdminPaymentParamsSchema,
  createAdminCreditNoteParamsSchema,
  listAdminInvoicesQuerySchema,
  listAdminPaymentsQuerySchema,
  rejectAdminPaymentParamsSchema,
} from '../../../../../contracts/generated/administration/administration.schemas.js'
import type { AuthenticatedAdmin } from '../../shared/types/authenticated-admin.js'
import type { createAdminPaymentsService } from '../services/admin-payments.service.js'

type CurrentAdmin = (request: FastifyRequest) => AuthenticatedAdmin

export function createAdminPaymentsController(
  payments: ReturnType<typeof createAdminPaymentsService>,
  currentAdmin: CurrentAdmin,
) {
  return {
    async list(request: FastifyRequest) {
      const query = listAdminPaymentsQuerySchema.parse(request.query)
      return payments.list(query.status, query.page)
    },
    async confirm(request: FastifyRequest) {
      const { paymentId } = confirmAdminPaymentParamsSchema.parse(request.params)
      const body = AdminPaymentConfirmationSchema.parse(request.body ?? {})
      return payments.confirm(currentAdmin(request), paymentId, body)
    },
    async invoices(request: FastifyRequest) {
      const query = listAdminInvoicesQuerySchema.parse(request.query)
      return payments.invoices(query.ownerId, query.page)
    },
    async creditNote(request: FastifyRequest, reply: FastifyReply) {
      const { invoiceId } = createAdminCreditNoteParamsSchema.parse(request.params)
      const body = AdminCreditNoteRequestSchema.parse(request.body)
      return reply.code(201).send(await payments.creditNote(currentAdmin(request), invoiceId, body))
    },
    async reject(request: FastifyRequest) {
      const { paymentId } = rejectAdminPaymentParamsSchema.parse(request.params)
      const body = AdminPaymentRejectionSchema.parse(request.body)
      return payments.reject(currentAdmin(request), paymentId, body)
    },
  }
}
