import type { FastifyInstance } from 'fastify'

import type { createOwnerOnboardingController } from '../controllers/owner-onboarding.controller.js'
import type { createOwnerOrganizationController } from '../controllers/owner-organization.controller.js'

export function registerOwnerOrganizationRoutes(
  app: FastifyInstance,
  controller: ReturnType<typeof createOwnerOrganizationController>,
  onboarding?: ReturnType<typeof createOwnerOnboardingController>,
) {
  if (onboarding) {
    app.get(
      '/organization-slugs/availability',
      { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
      onboarding.slugAvailability,
    )
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
