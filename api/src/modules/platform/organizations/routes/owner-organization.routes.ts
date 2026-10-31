import type { FastifyInstance } from 'fastify'

import { createRequirePortalOrigin } from '../../../../middlewares/require-portal-origin.js'
import type { createOwnerOnboardingController } from '../controllers/owner-onboarding.controller.js'
import type { createOwnerOrganizationController } from '../controllers/owner-organization.controller.js'

export function registerOwnerOrganizationRoutes(
  app: FastifyInstance,
  controller: ReturnType<typeof createOwnerOrganizationController>,
  portalOrigin?: string,
  onboarding?: ReturnType<typeof createOwnerOnboardingController>,
) {
  app.addHook('onRequest', createRequirePortalOrigin(portalOrigin))
  if (onboarding) {
    app.post(
      '/organizations',
      { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
      onboarding.create,
    )
    app.get('/organizations/:organizationId/onboarding', onboarding.get)
    app.put('/organizations/:organizationId/onboarding', onboarding.save)
    app.post('/organizations/:organizationId/onboarding/complete', onboarding.complete)
    app.post(
      '/organizations/:organizationId/branding',
      { bodyLimit: 3_000_000, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
      onboarding.upload,
    )
    app.get('/organizations/:organizationId/branding/:assetId', onboarding.image)
  }
  app.get('/organizations', controller.list)
  app.get('/organizations/:organizationId', controller.get)
}
