import type { preHandlerHookHandler } from 'fastify'

import { AppError } from '../lib/errors.js'
import type { IdentityPublicApi } from '../modules/identity/identity.public.js'

declare module 'fastify' {
  interface FastifyRequest {
    actor: { userId: string } | null
  }
}

export function createRequirePermission(identity: Pick<IdentityPublicApi, 'authorize'>) {
  return (permission: string): preHandlerHookHandler =>
    async (request) => {
      const actor = await identity.authorize(request.cookies.slama_session, permission)
      // Preserve the existing RBAC endpoint behavior, including anonymous 403 responses.
      if (!actor) throw new AppError(403, 'FORBIDDEN', 'Forbidden')
      request.actor = actor
    }
}
