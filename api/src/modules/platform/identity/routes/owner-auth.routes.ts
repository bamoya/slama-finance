import type { FastifyInstance } from 'fastify'

import type { createOwnerAuthController } from '../controllers/owner-auth.controller.js'

export function registerOwnerAuthRoutes(
  app: FastifyInstance,
  controller: ReturnType<typeof createOwnerAuthController>,
) {
  const limited = { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }
  app.post('/register', limited, controller.register)
  app.post('/login', limited, controller.login)
  app.get('/session', controller.session)
  app.post('/logout', controller.logout)
  app.post('/verification/request', limited, controller.requestVerification)
  app.post('/verification/confirm', limited, controller.confirmVerification)
  app.post('/password-reset/request', limited, controller.requestReset)
  app.post('/password-reset/confirm', limited, controller.confirmReset)
  app.post('/invitation/inspect', limited, controller.inspectInvitation)
  app.post('/invitation/accept', limited, controller.acceptInvitation)
}
