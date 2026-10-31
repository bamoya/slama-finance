import type { FastifyReply, FastifyRequest } from 'fastify'

import {
  OwnerEmailRequestSchema,
  OwnerLoginSchema,
  OwnerRegisterSchema,
  OwnerResetPasswordSchema,
  OwnerTokenSchema,
} from '../../../../contracts/generated/identity/owner-auth.schemas.js'
import type { createOwnerAuthService } from '../services/owner-auth.service.js'

type Service = ReturnType<typeof createOwnerAuthService>
const session = (owner: Awaited<ReturnType<Service['session']>>) => ({
  owner: {
    id: owner.id,
    email: owner.email,
    firstName: owner.firstName,
    lastName: owner.lastName,
    locale: owner.locale,
  },
})
const accepted = { message: 'If the account is eligible, an email will be sent.' }
export function createOwnerAuthController(service: Service, secure: boolean) {
  return {
    async register(request: FastifyRequest, reply: FastifyReply) {
      await service.register(OwnerRegisterSchema.parse(request.body))
      return reply.code(202).send(accepted)
    },
    async login(request: FastifyRequest, reply: FastifyReply) {
      const body = OwnerLoginSchema.parse(request.body)
      const result = await service.login(body.email, body.password)
      reply.setCookie('slama_owner_session', result.token, {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        path: '/',
        maxAge: result.maxAge,
      })
      return session(result.owner)
    },
    async session(request: FastifyRequest) {
      return session(await service.session(request.cookies.slama_owner_session))
    },
    async logout(request: FastifyRequest, reply: FastifyReply) {
      await service.logout(request.cookies.slama_owner_session)
      reply.clearCookie('slama_owner_session', { path: '/' })
      return reply.code(204).send()
    },
    async requestVerification(request: FastifyRequest, reply: FastifyReply) {
      await service.requestVerification(OwnerEmailRequestSchema.parse(request.body).email)
      return reply.code(202).send(accepted)
    },
    async confirmVerification(request: FastifyRequest, reply: FastifyReply) {
      await service.verify(OwnerTokenSchema.parse(request.body).token)
      return reply.code(204).send()
    },
    async requestReset(request: FastifyRequest, reply: FastifyReply) {
      await service.requestReset(OwnerEmailRequestSchema.parse(request.body).email)
      return reply.code(202).send(accepted)
    },
    async inspectInvitation(request: FastifyRequest) {
      return service.inspectInvitation(OwnerTokenSchema.parse(request.body).token)
    },
    async acceptInvitation(request: FastifyRequest, reply: FastifyReply) {
      const body = OwnerResetPasswordSchema.parse(request.body)
      await service.acceptInvitation(body.token, body.password)
      reply.clearCookie('slama_owner_session', { path: '/' })
      return reply.code(204).send()
    },
    async confirmReset(request: FastifyRequest, reply: FastifyReply) {
      const body = OwnerResetPasswordSchema.parse(request.body)
      await service.reset(body.token, body.password)
      reply.clearCookie('slama_owner_session', { path: '/' })
      return reply.code(204).send()
    },
  }
}
