import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import type { Client } from '../../../api/generated/models'
import { type BulkAction, BulkActions } from '../../../components/management/bulk-actions'
import { useUiLanguage } from '../../../lib/i18n'
import { useAuthorization } from '../../identity'
import { refreshClients, useClientActions } from '../queries'

export function ClientBulkActions({ selected, clear }: { selected: Client[]; clear: () => void }) {
  useUiLanguage()

  const { t } = useTranslation('bulk')
  const { can } = useAuthorization()
  const api = useClientActions()
  const cache = useQueryClient()
  const actions: BulkAction<Client>[] = [
    {
      key: 'archive',
      label: t('archive'),
      eligible: (row) => !row.archivedAt,
      run: (row) => api.archive(row.id, row.version),
    },
    {
      key: 'restore',
      label: t('restore'),
      eligible: (row) => !!row.archivedAt,
      run: (row) => api.restore(row.id, row.version),
    },
    {
      key: 'delete',
      label: t('delete'),
      destructive: true,
      run: (row) => api.delete(row.id, row.version),
    },
  ]
  return (
    <BulkActions
      selected={selected}
      actions={actions.filter((action) =>
        can(`clients.${action.key === 'delete' ? 'delete' : 'update'}`),
      )}
      name={(row) => row.displayName}
      clear={clear}
      refresh={() => refreshClients(cache)}
    />
  )
}
