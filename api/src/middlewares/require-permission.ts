import type { FastifyRequest, preHandlerHookHandler } from 'fastify'

import { AppError } from '../lib/errors.js'
import { organizationSessionToken } from '../lib/organization-session.js'
import type { IdentityPublicApi } from '../modules/organization/identity/identity.public.js'

declare module 'fastify' {
  interface FastifyRequest {
    actor: { userId: string } | null
  }
}

export function createRequirePermission(
  identity: Pick<IdentityPublicApi, 'authorize'>,
  check?: (request: FastifyRequest, permission: string) => Promise<void>,
) {
  return (permission: string): preHandlerHookHandler =>
    async (request) => {
      const actor = await identity.authorize(organizationSessionToken(request), permission)
      // Preserve the existing RBAC endpoint behavior, including anonymous 403 responses.
      if (!actor) throw new AppError(403, 'FORBIDDEN', 'Forbidden')
      request.actor = actor
      await check?.(request, permission)
    }
}
