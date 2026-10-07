import type { QueryClient } from '@tanstack/react-query'

import * as api from '../../api/generated/clients/clients'

export const useClientNotificationPreferences = (id: string, enabled = true) =>
  api.useListClientNotificationPreferences(id, { query: { enabled } })
export const refreshClientNotificationPreferences = (cache: QueryClient, id: string) =>
  cache.invalidateQueries({ queryKey: api.getListClientNotificationPreferencesQueryKey(id) })
export function useClientPreferenceActions() {
  const update = api.useUpdateClientNotificationPreference(),
    remove = api.useDeleteClientNotificationPreference()
  return {
    update: (
      id: string,
      ruleId: string,
      data: Parameters<typeof api.updateClientNotificationPreference>[2],
    ) => update.mutateAsync({ id, ruleId, data }),
    reset: (id: string, ruleId: string, expectedVersion: number) =>
      remove.mutateAsync({ id, ruleId, data: { expectedVersion } }),
  }
}
