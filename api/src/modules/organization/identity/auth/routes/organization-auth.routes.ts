import type { FastifyInstance } from 'fastify'

import { organizationStaffLoginParamsSchema } from '../../../../../contracts/generated/identity/organization-auth.schemas.js'
import type { createAuthController } from '../controllers/auth.controller.js'

type Controller = ReturnType<typeof createAuthController>
export function registerOrganizationAuthRoutes(
  app: FastifyInstance,
  resolve: (id: string) => Promise<Controller>,
) {
  const handler =
    (action: keyof Controller) =>
    async (
      request: Parameters<Controller['login']>[0],
      reply: Parameters<Controller['login']>[1],
    ) => {
      const { organizationId } = organizationStaffLoginParamsSchema.parse(request.params)
      const controller = await resolve(organizationId)
      return controller[action](request, reply)
    }
  const config = { rateLimit: { max: 5, timeWindow: '1 minute' } }
  app.post('/login', { config }, handler('login'))
  app.get('/session', handler('getSession'))
  app.post('/logout', handler('logout'))
  app.patch('/profile', { config }, handler('updateProfile'))
  app.post('/change-password', { config }, handler('changePassword'))
  app.post('/password-reset/request', { config }, handler('requestPasswordReset'))
  app.post('/password-reset/confirm', { config }, handler('confirmPasswordReset'))
}
