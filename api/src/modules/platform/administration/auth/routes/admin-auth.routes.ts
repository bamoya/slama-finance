import type { FastifyInstance } from 'fastify'

import type { createAdminAuthController } from '../controllers/admin-auth.controller.js'
import type { createAdminSecurityController } from '../controllers/admin-security.controller.js'

type Controller = ReturnType<typeof createAdminAuthController>

/** Unauthenticated sign-in endpoints, mounted at /api/v1/admin. */
export function registerAdminSignInRoutes(app: FastifyInstance, controller: Controller) {
  const limited = { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }
  app.post('/auth/login', limited, controller.login)
  app.post(
    '/auth/2fa',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    controller.verify,
  )
  // Recovery shares the pending session's five-attempt limit; passkey assertions are signature-bound.
  const second = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }
  const passkey = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }
  app.post('/auth/recovery', second, controller.recover)
  app.post('/auth/passkey/options', passkey, controller.passkeyOptions)
  app.post('/auth/passkey', passkey, controller.passkeyLogin)
  app.post('/auth/logout', controller.logout)
}

/** Requires an authenticated administrator session. */
export function registerAdminSessionRoutes(app: FastifyInstance, controller: Controller) {
  app.get('/auth/me', controller.me)
}

/** Security settings of the signed-in administrator (credential changes need reauthentication). */
export function registerAdminSecurityRoutes(
  app: FastifyInstance,
  controller: ReturnType<typeof createAdminSecurityController>,
) {
  const limited = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }
  app.post('/auth/reauthentication/options', limited, controller.reauthOptions)
  app.post('/auth/reauthentication', limited, controller.reauthenticate)
  app.get('/security', controller.overview)
  app.post('/security/passkeys/options', controller.registrationOptions)
  app.post('/security/passkeys', controller.registerPasskey)
  app.delete('/security/passkeys/:passkeyId', controller.removePasskey)
  app.post('/security/recovery-codes', controller.regenerateRecoveryCodes)
  app.post('/security/totp', controller.resetTotp)
  app.post('/security/totp/confirm', limited, controller.confirmTotp)
}
