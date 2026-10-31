import type { createAdminOverviewService } from '../services/admin-overview.service.js'

export function createAdminOverviewController(
  overview: ReturnType<typeof createAdminOverviewService>,
) {
  return { get: () => overview.get() }
}
