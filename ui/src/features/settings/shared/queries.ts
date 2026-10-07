import { type QueryClient } from '@tanstack/react-query'

import * as api from '../../../api/generated/settings/settings'
export {
  getGetBankAccountQueryOptions,
  getGetCompanySettingsQueryOptions,
  getGetDocumentTemplateQueryOptions,
} from '../../../api/generated/settings/settings'
export const settingsKeys = {
  company: api.getGetCompanySettingsQueryKey(),
  banks: api.getListBankAccountsQueryKey(),
  templates: api.getListDocumentTemplatesQueryKey(),
  detail: (resource: 'bank' | 'template', id: string) =>
    resource === 'bank'
      ? api.getGetBankAccountQueryKey(id)
      : api.getGetDocumentTemplateQueryKey(id),
}
export const useCompanySettings = (enabled = true) =>
  api.useGetCompanySettings({ query: { enabled } })
export const useBankAccounts = (enabled = true) => api.useListBankAccounts({ query: { enabled } })
export const useDocumentTemplates = (enabled = true) =>
  api.useListDocumentTemplates({ query: { enabled } })
export function useSettingsActions() {
  const company = api.useUpdateCompanySettings(),
    createBank = api.useCreateBankAccount(),
    saveBank = api.useUpdateBankAccount()
  const archiveBank = api.useArchiveBankAccount(),
    restoreBank = api.useRestoreBankAccount(),
    deleteBank = api.useDeleteBankAccount()
  const createTemplate = api.useCreateDocumentTemplate(),
    saveTemplate = api.useUpdateDocumentTemplate(),
    archiveTemplate = api.useArchiveDocumentTemplate(),
    deleteTemplate = api.useDeleteDocumentTemplate()
  return {
    saveCompany: (data: Parameters<typeof api.updateCompanySettings>[0]) =>
      company.mutateAsync({ data }),
    createBank: (data: Parameters<typeof api.createBankAccount>[0]) =>
      createBank.mutateAsync({ data }),
    saveBank: (id: string, data: Parameters<typeof api.updateBankAccount>[1]) =>
      saveBank.mutateAsync({ id, data }),
    archiveBank: (id: string, expectedVersion: number) =>
      archiveBank.mutateAsync({ id, data: { expectedVersion } }),
    restoreBank: (id: string, expectedVersion: number) =>
      restoreBank.mutateAsync({ id, data: { expectedVersion } }),
    deleteBank: (id: string, expectedVersion: number) =>
      deleteBank.mutateAsync({ id, data: { expectedVersion } }),
    createTemplate: (data: Parameters<typeof api.createDocumentTemplate>[0]) =>
      createTemplate.mutateAsync({ data }),
    saveTemplate: (id: string, data: Parameters<typeof api.updateDocumentTemplate>[1]) =>
      saveTemplate.mutateAsync({ id, data }),
    archiveTemplate: (id: string, expectedVersion: number) =>
      archiveTemplate.mutateAsync({ id, data: { expectedVersion } }),
    deleteTemplate: (id: string, expectedVersion: number) =>
      deleteTemplate.mutateAsync({ id, data: { expectedVersion } }),
  }
}
export const refreshSettings = (client: QueryClient) =>
  client.invalidateQueries({
    predicate: ({ queryKey }) =>
      typeof queryKey[0] === 'string' &&
      [settingsKeys.company[0], settingsKeys.banks[0], settingsKeys.templates[0]].some(
        (path) => queryKey[0] === path || (queryKey[0] as string).startsWith(path + '/'),
      ),
  })
