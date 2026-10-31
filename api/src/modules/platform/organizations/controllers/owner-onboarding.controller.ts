import type { FastifyReply, FastifyRequest } from 'fastify'

import {
  checkOwnerOrganizationSlugQuerySchema,
  CompleteOwnerOnboardingSchema,
  CreateOwnerOrganizationSchema,
  getOwnerBrandImageParamsSchema,
  getOwnerOnboardingParamsSchema,
  OwnerBrandUploadSchema,
  SaveOwnerOnboardingSchema,
} from '../../../../contracts/generated/identity/owner-onboarding.schemas.js'
import type { createOwnerOnboardingService } from '../services/owner-onboarding.service.js'

export function createOwnerOnboardingController(
  service: ReturnType<typeof createOwnerOnboardingService>,
) {
  const id = (r: FastifyRequest) => getOwnerOnboardingParamsSchema.parse(r.params).organizationId
  const token = (r: FastifyRequest) => r.cookies.slama_owner_session
  return {
    create: async (r: FastifyRequest, reply: FastifyReply) =>
      reply
        .code(201)
        .send(await service.create(token(r), CreateOwnerOrganizationSchema.parse(r.body))),
    slugAvailability: (r: FastifyRequest) =>
      service.slugAvailability(token(r), checkOwnerOrganizationSlugQuerySchema.parse(r.query).slug),
    get: (r: FastifyRequest) => service.get(token(r), id(r)),
    save: (r: FastifyRequest) =>
      service.save(token(r), id(r), SaveOwnerOnboardingSchema.parse(r.body)),
    complete: (r: FastifyRequest) =>
      service.complete(
        token(r),
        id(r),
        CompleteOwnerOnboardingSchema.parse(r.body).expectedVersion,
      ),
    upload: async (r: FastifyRequest, reply: FastifyReply) =>
      reply
        .code(201)
        .send(await service.upload(token(r), id(r), OwnerBrandUploadSchema.parse(r.body))),
    image: (r: FastifyRequest) => {
      const params = getOwnerBrandImageParamsSchema.parse(r.params)
      return service.image(token(r), params.organizationId, params.assetId)
    },
  }
}
