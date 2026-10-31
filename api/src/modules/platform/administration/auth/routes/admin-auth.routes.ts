import type { FastifyInstance } from 'fastify'

import type { createAdminAuthController } from '../controllers/admin-auth.controller.js'

type Controller = ReturnType<typeof createAdminAuthController>

/** Unauthenticated sign-in endpoints, mounted at /v1/admin. */
export function registerAdminSignInRoutes(app: FastifyInstance, controller: Controller) {
  const limited = { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }
  app.post('/auth/login', limited, controller.login)
  app.post(
    '/auth/2fa',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    controller.verify,
  )
  app.post('/auth/logout', controller.logout)
}

/** Requires an authenticated administrator session. */
export function registerAdminSessionRoutes(app: FastifyInstance, controller: Controller) {
  app.get('/auth/me', controller.me)
}
