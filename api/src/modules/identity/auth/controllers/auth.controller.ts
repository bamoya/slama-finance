import type { FastifyReply, FastifyRequest } from 'fastify'

import {
  ChangePasswordSchema as changePasswordSchema,
  LoginSchema as loginSchema,
  PasswordResetConfirmSchema as resetSchema,
  PasswordResetRequestSchema as requestSchema,
  UpdateProfileSchema,
} from '../../../../contracts/generated/identity/auth.schemas.js'
import { toSession } from '../mappers/auth.mapper.js'
import type { createAuthService } from '../services/auth.service.js'
import type { createPasswordRecoveryService } from '../services/password-recovery.service.js'

export function createAuthController(
  service: ReturnType<typeof createAuthService>,
  recovery: ReturnType<typeof createPasswordRecoveryService>,
  options: { secure: boolean; ttlDays: number },
  permissionKeys: (userId: string) => Promise<string[]>,
) {
  return {
    async updateProfile(request: FastifyRequest) {
      const result = await service.updateProfile(
        request.cookies.slama_session,
        UpdateProfileSchema.parse(request.body),
      )
      return toSession(result.user, result.purpose, await permissionKeys(result.user.id))
    },
    async requestPasswordReset(request: FastifyRequest, reply: FastifyReply) {
      await recovery.request(requestSchema.parse(request.body).email)
      return reply
        .code(202)
        .send({ message: 'If the account is eligible, a password reset email will be sent.' })
    },
    async confirmPasswordReset(request: FastifyRequest, reply: FastifyReply) {
      const body = resetSchema.parse(request.body)
      await recovery.reset(body.token, body.password)
      reply.clearCookie('slama_session', { path: '/' })
      return reply.code(204).send()
    },
    async login(request: FastifyRequest, reply: FastifyReply) {
      const body = loginSchema.parse(request.body)
      const result = await service.login(body.email, body.password)
      reply.setCookie('slama_session', result.token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: options.secure,
        path: '/',
        maxAge: result.maxAge,
      })
      return toSession(
        result.user,
        result.purpose,
        result.purpose === 'full' ? await permissionKeys(result.user.id) : [],
      )
    },
    async getSession(request: FastifyRequest) {
      const result = await service.getSession(request.cookies.slama_session)
      return toSession(
        result.user,
        result.purpose,
        result.purpose === 'full' ? await permissionKeys(result.user.id) : [],
      )
    },
    async changePassword(request: FastifyRequest, reply: FastifyReply) {
      const body = changePasswordSchema.parse(request.body)
      const result = await service.changePassword(
        request.cookies.slama_session,
        body.newPassword,
        body.currentPassword,
      )
      reply.setCookie('slama_session', result.token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: options.secure,
        path: '/',
        maxAge: result.maxAge,
      })
      return toSession(result.user, result.purpose, await permissionKeys(result.user.id))
    },
    async logout(request: FastifyRequest, reply: FastifyReply) {
      await service.logout(request.cookies.slama_session)
      reply.clearCookie('slama_session', { path: '/' })
      return reply.code(204).send()
    },
  }
}
