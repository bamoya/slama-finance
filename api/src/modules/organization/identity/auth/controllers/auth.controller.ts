import type { FastifyReply, FastifyRequest } from 'fastify'

import {
  ChangePasswordSchema as changePasswordSchema,
  LoginSchema as loginSchema,
  PasswordResetConfirmSchema as resetSchema,
  PasswordResetRequestSchema as requestSchema,
  UpdateProfileSchema,
} from '../../../../../contracts/generated/identity/auth.schemas.js'
import { toSession } from '../mappers/auth.mapper.js'
import type { createAuthService } from '../services/auth.service.js'
import type { createPasswordRecoveryService } from '../services/password-recovery.service.js'

export function createAuthController(
  service: ReturnType<typeof createAuthService>,
  recovery: ReturnType<typeof createPasswordRecoveryService>,
  options: {
    secure: boolean
    ttlDays: number
    cookieName?: string
    cookiePath?: string
    checkAccess?: () => Promise<unknown>
  },
  permissionKeys: (userId: string) => Promise<string[]>,
) {
  return {
    async updateProfile(request: FastifyRequest) {
      const result = await service.updateProfile(
        request.cookies[options.cookieName ?? 'slama_session'],
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
      reply.clearCookie(options.cookieName ?? 'slama_session', { path: options.cookiePath ?? '/' })
      return reply.code(204).send()
    },
    async login(request: FastifyRequest, reply: FastifyReply) {
      const body = loginSchema.parse(request.body)
      await options.checkAccess?.()
      const result = await service.login(body.email, body.password)
      reply.setCookie(options.cookieName ?? 'slama_session', result.token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: options.secure,
        path: options.cookiePath ?? '/',
        maxAge: result.maxAge,
      })
      return toSession(
        result.user,
        result.purpose,
        result.purpose === 'full' ? await permissionKeys(result.user.id) : [],
      )
    },
    async getSession(request: FastifyRequest) {
      const result = await service.getSession(
        request.cookies[options.cookieName ?? 'slama_session'],
      )
      return toSession(
        result.user,
        result.purpose,
        result.purpose === 'full' ? await permissionKeys(result.user.id) : [],
      )
    },
    async changePassword(request: FastifyRequest, reply: FastifyReply) {
      const body = changePasswordSchema.parse(request.body)
      const result = await service.changePassword(
        request.cookies[options.cookieName ?? 'slama_session'],
        body.newPassword,
        body.currentPassword,
      )
      reply.setCookie(options.cookieName ?? 'slama_session', result.token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: options.secure,
        path: options.cookiePath ?? '/',
        maxAge: result.maxAge,
      })
      return toSession(result.user, result.purpose, await permissionKeys(result.user.id))
    },
    async logout(request: FastifyRequest, reply: FastifyReply) {
      await service.logout(request.cookies[options.cookieName ?? 'slama_session'])
      reply.clearCookie(options.cookieName ?? 'slama_session', { path: options.cookiePath ?? '/' })
      return reply.code(204).send()
    },
  }
}
