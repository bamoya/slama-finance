import type { FastifyReply, FastifyRequest } from 'fastify'

import {
  CreditNoteInputSchema,
  CreditNoteUpdateSchema,
  CreditNoteVersionSchema,
  getCreditNoteParamsSchema,
  getInvoiceCreditableLinesParamsSchema,
  listCreditNotesQuerySchema,
  listInvoiceCreditNotesParamsSchema,
} from '../../../../../contracts/generated/sales/credit-notes.schemas.js'
import type { createCreditNoteService } from '../services/credit-note.service.js'

const id = (request: FastifyRequest) => getCreditNoteParamsSchema.parse(request.params).id

export function createCreditNoteController(service: ReturnType<typeof createCreditNoteService>) {
  return {
    list(request: FastifyRequest) {
      return service.list(listCreditNotesQuerySchema.parse(request.query))
    },
    get(request: FastifyRequest) {
      return service.get(id(request))
    },
    async create(request: FastifyRequest, reply: FastifyReply) {
      return reply
        .code(201)
        .send(
          await service.create(CreditNoteInputSchema.parse(request.body), request.actor!.userId),
        )
    },
    update(request: FastifyRequest) {
      return service.update(
        id(request),
        CreditNoteUpdateSchema.parse(request.body),
        request.actor!.userId,
      )
    },
    async delete(request: FastifyRequest, reply: FastifyReply) {
      await service.delete(
        id(request),
        CreditNoteVersionSchema.parse(request.body).expectedVersion,
        request.actor!.userId,
      )
      return reply.code(204).send()
    },
    issue(request: FastifyRequest) {
      return service.issue(
        id(request),
        CreditNoteVersionSchema.parse(request.body).expectedVersion,
        request.actor!.userId,
      )
    },
    async pdf(request: FastifyRequest, reply: FastifyReply) {
      return reply.code(202).send(await service.preparePdf(id(request), request.actor!.userId))
    },
    artifacts(request: FastifyRequest) {
      return service.artifacts(id(request), request.actor!.userId)
    },
    forInvoice(request: FastifyRequest) {
      return service.forInvoice(
        listInvoiceCreditNotesParamsSchema.parse(request.params).id,
        request.actor!.userId,
      )
    },
    creditableLines(request: FastifyRequest) {
      return service.creditableLines(
        getInvoiceCreditableLinesParamsSchema.parse(request.params).id,
        request.actor!.userId,
      )
    },
  }
}
