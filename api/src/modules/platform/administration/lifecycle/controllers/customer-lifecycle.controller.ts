import type { FastifyReply, FastifyRequest } from 'fastify'

import {
  AdminCoverageExtensionSchema,
  AdminOrganizationSlugChangeSchema,
  AdminOwnerCreateSchema,
  AdminPlanChangeSchema,
  AdminReasonSchema,
  AdminSensitiveActionSchema,
  blockAdminOwnerParamsSchema,
  suspendAdminOrganizationParamsSchema,
} from '../../../../../contracts/generated/administration/administration.schemas.js'
import type { AuthenticatedAdmin } from '../../shared/types/authenticated-admin.js'
import type { createCustomerLifecycleService } from '../services/customer-lifecycle.service.js'

type CurrentAdmin = (request: FastifyRequest) => AuthenticatedAdmin
const reasonOf = (request: FastifyRequest) => AdminReasonSchema.parse(request.body).reason.trim()
const sensitive = (request: FastifyRequest) => {
  const body = AdminSensitiveActionSchema.parse(request.body)
  return { reason: body.reason.trim(), code: body.code }
}
// Every owner-scoped route shares the same { ownerId } path parameter shape.
const ownerOf = (request: FastifyRequest) =>
  blockAdminOwnerParamsSchema.parse(request.params).ownerId
const organizationOf = (request: FastifyRequest) =>
  suspendAdminOrganizationParamsSchema.parse(request.params).organizationId

export function createCustomerLifecycleController(
  lifecycle: ReturnType<typeof createCustomerLifecycleService>,
  currentAdmin: CurrentAdmin,
) {
  return {
    async create(request: FastifyRequest, reply: FastifyReply) {
      const body = AdminOwnerCreateSchema.parse(request.body)
      const created = await lifecycle.create(currentAdmin(request), {
        ...body,
        reason: body.reason.trim(),
      })
      return reply.code(201).send(created)
    },
    async resendInvitation(request: FastifyRequest, reply: FastifyReply) {
      await lifecycle.resendInvitation(currentAdmin(request), ownerOf(request), reasonOf(request))
      return reply.code(204).send()
    },
    block: (request: FastifyRequest) =>
      lifecycle.block(currentAdmin(request), ownerOf(request), sensitive(request)),
    unblock: (request: FastifyRequest) =>
      lifecycle.unblock(currentAdmin(request), ownerOf(request), reasonOf(request)),
    scheduleDeletion: (request: FastifyRequest) =>
      lifecycle.scheduleDeletion(currentAdmin(request), ownerOf(request), sensitive(request)),
    cancelDeletion: (request: FastifyRequest) =>
      lifecycle.cancelDeletion(currentAdmin(request), ownerOf(request), reasonOf(request)),
    suspendSubscription: (request: FastifyRequest) =>
      lifecycle.suspendSubscription(currentAdmin(request), ownerOf(request), sensitive(request)),
    resumeSubscription: (request: FastifyRequest) =>
      lifecycle.resumeSubscription(currentAdmin(request), ownerOf(request), reasonOf(request)),
    changePlan(request: FastifyRequest) {
      const body = AdminPlanChangeSchema.parse(request.body)
      return lifecycle.changePlan(
        currentAdmin(request),
        ownerOf(request),
        body.planCode,
        body.reason.trim(),
      )
    },
    extend(request: FastifyRequest) {
      const body = AdminCoverageExtensionSchema.parse(request.body)
      return lifecycle.extend(
        currentAdmin(request),
        ownerOf(request),
        body.days,
        body.reason.trim(),
      )
    },
    suspendOrganization: (request: FastifyRequest) =>
      lifecycle.suspendOrganization(
        currentAdmin(request),
        organizationOf(request),
        sensitive(request),
      ),
    renameOrganizationSlug(request: FastifyRequest) {
      const body = AdminOrganizationSlugChangeSchema.parse(request.body)
      return lifecycle.renameOrganizationSlug(currentAdmin(request), organizationOf(request), {
        slug: body.slug,
        reason: body.reason.trim(),
        code: body.code,
      })
    },
    reactivateOrganization: (request: FastifyRequest) =>
      lifecycle.reactivateOrganization(
        currentAdmin(request),
        organizationOf(request),
        reasonOf(request),
      ),
  }
}
