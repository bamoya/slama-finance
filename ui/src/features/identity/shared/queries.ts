import { type QueryClient } from '@tanstack/react-query'

import * as api from '../../../api/generated/identity/identity'
import {
  type ListStaffQuery,
  listStaffQuerySchema,
} from '../../../api/generated/schemas/identity/staff.schemas'
import { privateMutation } from './private-mutation'
export const identityKeys = {
  roles: api.getListRolesQueryKey(),
  permissions: api.getListPermissionsQueryKey(),
  staff: api.getListStaffQueryKey(),
  detail: api.getGetStaffQueryKey,
}
export const useRoles = (enabled = true) => api.useListRoles({ query: { enabled } })
export const usePermissions = (enabled = true) => api.useListPermissions({ query: { enabled } })
export const useStaffList = (query: ListStaffQuery) =>
  api.useListStaff(listStaffQuerySchema.parse(query))
export const useStaff = (id: string) => api.useGetStaff(id, { query: { enabled: !!id } })
export function useRoleActions() {
  const create = api.useCreateRole(),
    remove = api.useDeleteRole(),
    permissions = api.useReplaceRolePermissions()
  return {
    create: (data: Parameters<typeof api.createRole>[0]) => create.mutateAsync({ data }),
    remove: (roleId: string) => remove.mutateAsync({ roleId }),
    replacePermissions: (roleId: string, data: Parameters<typeof api.replaceRolePermissions>[1]) =>
      permissions.mutateAsync({ roleId, data }),
  }
}
export function useStaffActions() {
  const create = api.useCreateStaff({ mutation: { gcTime: 0 } }),
    update = api.useUpdateStaff(),
    roles = api.useReplaceUserRoles()
  const disable = api.useDisableStaff(),
    enable = api.useEnableStaff(),
    archive = api.useArchiveStaff(),
    reissue = api.useReissueTemporaryPassword({ mutation: { gcTime: 0 } })
  return {
    create: (data: Parameters<typeof api.createStaff>[0]) =>
      privateMutation(() => create.mutateAsync({ data }), create.reset),
    update: (userId: string, data: Parameters<typeof api.updateStaff>[1]) =>
      update.mutateAsync({ userId, data }),
    replaceRoles: (userId: string, data: Parameters<typeof api.replaceUserRoles>[1]) =>
      roles.mutateAsync({ userId, data }),
    disable: (userId: string) => disable.mutateAsync({ userId }),
    enable: (userId: string) => enable.mutateAsync({ userId }),
    archive: (userId: string) => archive.mutateAsync({ userId }),
    reissue: (userId: string) =>
      privateMutation(() => reissue.mutateAsync({ userId }), reissue.reset),
  }
}
export async function refreshIdentity(cache: QueryClient) {
  await Promise.all([
    cache.invalidateQueries({ queryKey: identityKeys.roles }),
    cache.invalidateQueries({ queryKey: identityKeys.permissions }),
    cache.invalidateQueries({
      predicate: ({ queryKey }) =>
        typeof queryKey[0] === 'string' &&
        (queryKey[0] === identityKeys.staff[0] ||
          queryKey[0].startsWith(identityKeys.staff[0] + '/')),
    }),
    cache.invalidateQueries({ queryKey: api.getGetSessionQueryKey() }),
  ])
}
