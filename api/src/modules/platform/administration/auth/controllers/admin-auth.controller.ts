import type { FastifyReply, FastifyRequest } from 'fastify'

import {
  AdminLoginSchema,
  AdminTwoFactorSchema,
} from '../../../../../contracts/generated/administration/administration.schemas.js'
import type { AuthenticatedAdmin } from '../../shared/types/authenticated-admin.js'
import { ADMIN_IDLE_MINUTES, type createAdminAuthService } from '../services/admin-auth.service.js'

export const ADMIN_COOKIE = 'slama_admin_session'

export function createAdminAuthController(
  auth: ReturnType<typeof createAdminAuthService>,
  secure: boolean,
) {
  const admins = new WeakMap<FastifyRequest, AuthenticatedAdmin>()
  const currentAdmin = (request: FastifyRequest) => admins.get(request)!
  const cookie = (reply: FastifyReply, token: string, maxAge: number) =>
    reply.setCookie(ADMIN_COOKIE, token, {
      httpOnly: true,
      secure,
      sameSite: 'strict',
      path: '/',
      maxAge,
    })
  const session = (a: AuthenticatedAdmin) => ({
    admin: { id: a.id, email: a.email, name: a.name },
    expiresAt: a.expiresAt.toISOString(),
    idleTimeoutSeconds: ADMIN_IDLE_MINUTES * 60,
  })
  return {
    currentAdmin,
    /** Only the administrator cookie is read; owner and staff cookies never authorize here. */
    async requireAdmin(request: FastifyRequest) {
      admins.set(request, await auth.authenticate(request.cookies[ADMIN_COOKIE]))
    },
    async login(request: FastifyRequest, reply: FastifyReply) {
      const body = AdminLoginSchema.parse(request.body)
      const result = await auth.login(body.email, body.password)
      cookie(reply, result.token, result.maxAge)
      return { step: result.step, enrollment: result.enrollment }
    },
    async verify(request: FastifyRequest, reply: FastifyReply) {
      const body = AdminTwoFactorSchema.parse(request.body)
      const result = await auth.verify(request.cookies[ADMIN_COOKIE], body.code)
      cookie(reply, result.token, result.maxAge)
      return session(result.admin)
    },
    async me(request: FastifyRequest) {
      return session(currentAdmin(request))
    },
    async logout(request: FastifyRequest, reply: FastifyReply) {
      await auth.logout(request.cookies[ADMIN_COOKIE])
      reply.clearCookie(ADMIN_COOKIE, { path: '/' })
      return reply.code(204).send()
    },
  }
}
