import type { FastifyRequest } from 'fastify'

import { organizationSessionToken } from '../../../../../lib/organization-session.js'
import type { createWorkspaceService } from '../services/workspace.service.js'
export function createWorkspaceController(service: ReturnType<typeof createWorkspaceService>) {
  return {
    session(request: FastifyRequest) {
      return service.session(request.organizationId!, 'staff', organizationSessionToken(request))
    },
  }
}
