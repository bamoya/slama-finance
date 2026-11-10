import type { FastifyReply, FastifyRequest } from 'fastify'

import {
  AdminPasskeyRegistrationSchema,
  AdminReauthenticationSchema,
  AdminTwoFactorSchema,
  removeAdminPasskeyParamsSchema,
} from '../../../../../contracts/generated/administration/administration.schemas.js'
import type { AuthenticatedAdmin } from '../../shared/types/authenticated-admin.js'
import type { createAdminSecurityService } from '../services/admin-security.service.js'

export function createAdminSecurityController(
  security: ReturnType<typeof createAdminSecurityService>,
  currentAdmin: (request: FastifyRequest) => AuthenticatedAdmin,
) {
  return {
    overview: (request: FastifyRequest) => security.overview(currentAdmin(request)),
    reauthOptions: (request: FastifyRequest) => security.reauthOptions(currentAdmin(request)),
    reauthenticate: (request: FastifyRequest) =>
      security.reauthenticate(
        currentAdmin(request),
        AdminReauthenticationSchema.parse(request.body),
      ),
    registrationOptions: (request: FastifyRequest) =>
      security.registrationOptions(currentAdmin(request)),
    async registerPasskey(request: FastifyRequest, reply: FastifyReply) {
      const body = AdminPasskeyRegistrationSchema.parse(request.body)
      return reply.code(201).send(await security.registerPasskey(currentAdmin(request), body))
    },
    async removePasskey(request: FastifyRequest, reply: FastifyReply) {
      const { passkeyId } = removeAdminPasskeyParamsSchema.parse(request.params)
      await security.removePasskey(currentAdmin(request), passkeyId)
      return reply.code(204).send()
    },
    regenerateRecoveryCodes: (request: FastifyRequest) =>
      security.regenerateRecoveryCodes(currentAdmin(request)),
    resetTotp: (request: FastifyRequest) => security.resetTotp(currentAdmin(request)),
    async confirmTotp(request: FastifyRequest, reply: FastifyReply) {
      const { code } = AdminTwoFactorSchema.parse(request.body)
      await security.confirmTotp(currentAdmin(request), code)
      return reply.code(204).send()
    },
  }
}
