import type { ListOwnerOrganizationsQuery } from '../../../../contracts/generated/identity/owner-organizations.schemas.js'
import { AppError } from '../../../../lib/errors.js'
import type { createOwnerAuthService } from '../../identity/services/owner-auth.service.js'
import { toOwnerOrganization } from '../mappers/owner-organization.mapper.js'
import type { createOwnerOrganizationRepository } from '../repositories/owner-organization.repository.js'

export function createOwnerOrganizationService(
  repository: ReturnType<typeof createOwnerOrganizationRepository>,
  owners: ReturnType<typeof createOwnerAuthService>,
) {
  return {
    async list(token: string | undefined, query: ListOwnerOrganizationsQuery) {
      const owner = await owners.session(token)
      const result = await repository.list(owner.id, query)
      return { ...result, items: result.items.map(toOwnerOrganization) }
    },
    async get(token: string | undefined, id: string) {
      const owner = await owners.session(token)
      const row = await repository.get(owner.id, id)
      if (!row) throw new AppError(404, 'ORGANIZATION_NOT_FOUND', 'Organization not found.')
      return toOwnerOrganization(row)
    },
  }
}
