import type { QueryClient } from '@tanstack/react-query'

import * as api from '../../../api/generated/settings/settings'

export const useNotificationRules = () => api.useListNotificationRules()
export const useNotificationRulePreview = () => api.usePreviewNotificationRule()
export const refreshNotificationRules = (cache: QueryClient) =>
  Promise.all([
    cache.invalidateQueries({ queryKey: api.getListNotificationRulesQueryKey() }),
    cache.invalidateQueries({
      predicate: ({ queryKey }) =>
        typeof queryKey[0] === 'string' && queryKey[0].includes('/notification-preferences'),
    }),
  ])
export function useNotificationRuleActions() {
  const update = api.useUpdateNotificationRule(),
    test = api.useTestNotificationRule()
  return {
    update: (id: string, data: Parameters<typeof api.updateNotificationRule>[1]) =>
      update.mutateAsync({ id, data }),
    test: (id: string) => test.mutateAsync({ id }),
  }
}
