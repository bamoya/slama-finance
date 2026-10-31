import type { FastifyInstance } from 'fastify'

import type { createAuthController } from '../controllers/auth.controller.js'

export function registerAuthRoutes(
  app: FastifyInstance,
  controller: ReturnType<typeof createAuthController>,
) {
  // Sensitive auth endpoints: five attempts per minute per client IP, per route.
  const config = { rateLimit: { max: 5, timeWindow: '1 minute' } }

  app.post('/login', { config }, controller.login)
  app.patch('/profile', { config }, controller.updateProfile)
  app.post('/change-password', { config }, controller.changePassword)
  app.get('/session', controller.getSession)
  app.post('/logout', controller.logout)
  app.post('/password-reset/request', { config }, controller.requestPasswordReset)
  app.post('/password-reset/confirm', { config }, controller.confirmPasswordReset)
}
