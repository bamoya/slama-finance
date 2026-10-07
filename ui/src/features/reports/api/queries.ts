import type { QueryClient } from '@tanstack/react-query'

import * as api from '../../../api/generated/reporting/reporting'

export const useDashboard = (params?: Parameters<typeof api.getDashboard>[0], enabled = true) =>
  api.useGetDashboard(params, { query: { enabled } })
export const useAnalysis = (params?: Parameters<typeof api.getReportAnalysis>[0], enabled = true) =>
  api.useGetReportAnalysis(params, { query: { enabled } })
export const useReportSections = () => api.useListReportSections()
export const useReportSchedules = (params?: Parameters<typeof api.listReportSchedules>[0]) =>
  api.useListReportSchedules(params)
export const useReportSchedule = (id: string, enabled = true) =>
  api.useGetReportSchedule(id, { query: { enabled } })
export const useReportRecipients = (
  params: Parameters<typeof api.listReportEligibleRecipients>[0],
  enabled = true,
) => api.useListReportEligibleRecipients(params, { query: { enabled } })
export const useReportRuns = (
  id: string,
  params?: Parameters<typeof api.listReportScheduleRuns>[1],
  enabled = true,
) => api.useListReportScheduleRuns(id, params, { query: { enabled } })
export const useReportRun = (id: string) =>
  api.useGetReportRun(id, {
    query: {
      refetchInterval: (query) =>
        ['queued', 'running'].includes(query.state.data?.status ?? '') ||
        query.state.data?.deliveries.some((delivery) =>
          ['pending', 'queued', 'sending'].includes(delivery.status),
        )
          ? 3000
          : false,
    },
  })
export const exportReport = api.exportReport
export const useSchedulePreview = api.usePreviewReportSchedule
export const useScheduleTestEmail = api.useSendReportScheduleTestEmail
export const useRunCleanup = api.useCleanupReportRun
export const useRunRegenerate = api.useRegenerateReportRunFiles
export const refreshSchedules = (cache: QueryClient) =>
  cache.invalidateQueries({
    predicate: ({ queryKey }) =>
      typeof queryKey[0] === 'string' &&
      (queryKey[0].startsWith('/v1/report-schedules') || queryKey[0].startsWith('/v1/report-runs')),
  })
export function useScheduleActions() {
  const create = api.useCreateReportSchedule(),
    update = api.useUpdateReportSchedule()
  return {
    create: (data: Parameters<typeof api.createReportSchedule>[0]) => create.mutateAsync({ data }),
    update: (id: string, data: Parameters<typeof api.updateReportSchedule>[1]) =>
      update.mutateAsync({ id, data }),
    enable: api.enableReportSchedule,
    disable: api.disableReportSchedule,
    archive: api.archiveReportSchedule,
    restore: api.restoreReportSchedule,
    delete: api.deleteReportSchedule,
    retry: api.retryReportRun,
  }
}
