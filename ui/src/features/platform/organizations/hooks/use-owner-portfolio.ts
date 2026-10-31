import { useQuery } from '@tanstack/react-query'

import {
  getListOwnerOrganizationsQueryKey,
  listOwnerOrganizations,
} from '../../../../api/generated/identity/identity'
import type { OwnerOrganization } from '../../../../api/generated/models'
import type { ApiError } from '../../../../lib/api-error'

/** Read every page: overview totals must not accidentally describe only the first page. */
export function useOwnerPortfolio() {
  return useQuery<OwnerOrganization[], ApiError>({
    queryKey: [...getListOwnerOrganizationsQueryKey(), 'portfolio'],
    staleTime: 30_000,
    retry: false,
    queryFn: async ({ signal }) => {
      const organizations: OwnerOrganization[] = []
      for (let page = 1; ; page++) {
        const result = await listOwnerOrganizations({ page, pageSize: 50 }, undefined, signal)
        organizations.push(...result.items)
        if (organizations.length >= result.total || !result.items.length) break
      }
      return organizations
    },
  })
}
