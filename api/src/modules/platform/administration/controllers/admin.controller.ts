import type { FastifyReply, FastifyRequest } from 'fastify'

import {
  AdminBillingSettingsUpdateSchema,
  AdminLoginSchema,
  AdminPaymentConfirmationSchema,
  AdminPaymentRejectionSchema,
  AdminTwoFactorSchema,
  confirmAdminPaymentParamsSchema,
  getAdminOwnerParamsSchema,
  listAdminAuditQuerySchema,
  listAdminOwnersQuerySchema,
  listAdminPaymentsQuerySchema,
  rejectAdminPaymentParamsSchema,
} from '../../../../contracts/generated/administration/administration.schemas.js'
import {
  ADMIN_IDLE_MINUTES,
  type AuthenticatedAdmin,
  type createAdminAuthService,
} from '../services/admin-auth.service.js'
import type { createAdminPortalService } from '../services/admin-portal.service.js'

export const ADMIN_COOKIE = 'slama_admin_session'

export function createAdminController(
  auth: ReturnType<typeof createAdminAuthService>,
  portal: ReturnType<typeof createAdminPortalService>,
  secure: boolean,
) {
  const admins = new WeakMap<FastifyRequest, AuthenticatedAdmin>()
  const admin = (request: FastifyRequest) => admins.get(request)!
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
      return session(admin(request))
    },
    async logout(request: FastifyRequest, reply: FastifyReply) {
      await auth.logout(request.cookies[ADMIN_COOKIE])
      reply.clearCookie(ADMIN_COOKIE, { path: '/' })
      return reply.code(204).send()
    },
    async payments(request: FastifyRequest) {
      const query = listAdminPaymentsQuerySchema.parse(request.query)
      return portal.payments(query.status, query.page)
    },
    async confirm(request: FastifyRequest) {
      const { paymentId } = confirmAdminPaymentParamsSchema.parse(request.params)
      const body = AdminPaymentConfirmationSchema.parse(request.body ?? {})
      return portal.confirm(admin(request), paymentId, body.receivedReference)
    },
    async reject(request: FastifyRequest) {
      const { paymentId } = rejectAdminPaymentParamsSchema.parse(request.params)
      const body = AdminPaymentRejectionSchema.parse(request.body)
      return portal.reject(admin(request), paymentId, body.reason)
    },
    async owners(request: FastifyRequest) {
      const query = listAdminOwnersQuerySchema.parse(request.query)
      return portal.owners(query.search, query.page)
    },
    async owner(request: FastifyRequest) {
      return portal.owner(getAdminOwnerParamsSchema.parse(request.params).ownerId)
    },
    settings: () => portal.settings(),
    async updateSettings(request: FastifyRequest) {
      return portal.updateSettings(
        admin(request),
        AdminBillingSettingsUpdateSchema.parse(request.body),
      )
    },
    async audit(request: FastifyRequest) {
      return portal.audit(listAdminAuditQuerySchema.parse(request.query).page)
    },
  }
}
