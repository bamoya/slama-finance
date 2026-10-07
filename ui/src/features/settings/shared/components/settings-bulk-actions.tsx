import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import type {
  BankAccount,
  DocumentTemplate,
} from '../../../../api/generated/schemas/settings/settings.schemas'
import { type BulkAction, BulkActions } from '../../../../components/management/bulk-actions'
import { useUiLanguage } from '../../../../lib/i18n'
import { useAuthorization } from '../../../identity'
import { refreshSettings, useSettingsActions } from '../queries'

export function SettingsBulkActions({
  resource,
  selected,
  clear,
}: {
  resource: 'bank' | 'template'
  selected: (BankAccount | DocumentTemplate)[]
  clear: () => void
}) {
  useUiLanguage()

  const { t } = useTranslation('bulk')
  const { can } = useAuthorization()
  const cache = useQueryClient()
  const api = useSettingsActions()
  const bank = resource === 'bank'
  const prefix = bank ? 'bank_accounts' : 'templates'
  const actions: BulkAction<BankAccount | DocumentTemplate>[] = []
  if (can(`${prefix}.update`))
    actions.push({
      key: 'archive',
      label: t('archive'),
      eligible: (row) => !row.archivedAt,
      run: (row) =>
        bank ? api.archiveBank(row.id, row.version) : api.archiveTemplate(row.id, row.version),
    })
  if (bank && can('bank_accounts.update'))
    actions.push({
      key: 'restore',
      label: t('restore'),
      eligible: (row) => !!row.archivedAt,
      run: (row) => api.restoreBank(row.id, row.version),
    })
  if (can(`${prefix}.delete`))
    actions.push({
      key: 'delete',
      label: t('delete'),
      destructive: true,
      run: (row) =>
        bank ? api.deleteBank(row.id, row.version) : api.deleteTemplate(row.id, row.version),
    })
  return (
    <BulkActions
      selected={selected}
      actions={actions}
      name={(row) => row.name}
      clear={clear}
      refresh={() => refreshSettings(cache)}
    />
  )
}
