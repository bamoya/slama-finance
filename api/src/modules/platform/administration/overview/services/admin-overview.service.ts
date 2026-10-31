import type { AdminOverview } from '../../../../../contracts/generated/administration/administration.schemas.js'
import type { AdminTransaction } from '../../shared/repositories/admin-transaction.repository.js'
import type { createAdminOverviewRepository } from '../repositories/admin-overview.repository.js'

export function createAdminOverviewService(
  repo: ReturnType<typeof createAdminOverviewRepository>,
  withAdmin: AdminTransaction,
  clock: () => Date = () => new Date(),
) {
  return {
    get: (): Promise<AdminOverview> => withAdmin((tx) => repo.counts(clock(), tx)),
  }
}
