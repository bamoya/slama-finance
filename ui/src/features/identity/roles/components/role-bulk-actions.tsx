import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import type { Role } from '../../../../api/generated/schemas/identity/rbac.schemas'
import { BulkActions } from '../../../../components/management/bulk-actions'
import { useUiLanguage } from '../../../../lib/i18n'
import { useAuthorization } from '../../auth/hooks/use-authorization'
import { refreshIdentity, useRoleActions } from '../../shared/queries'

export function RoleBulkActions({ selected, clear }: { selected: Role[]; clear: () => void }) {
  useUiLanguage()

  const { t } = useTranslation('bulk')
  const { can } = useAuthorization()
  const cache = useQueryClient()
  const api = useRoleActions()
  return (
    <BulkActions
      selected={selected}
      name={(row) => row.name}
      clear={clear}
      refresh={() => refreshIdentity(cache)}
      actions={
        can('roles.delete')
          ? [
              {
                key: 'delete',
                label: t('delete'),
                destructive: true,
                warning: t('roleDeleteWarning'),
                eligible: (row) =>
                  !row.isSystem && row.key !== 'admin' && row.permissionKeys.every(can),
                run: (row) => api.remove(row.id),
              },
            ]
          : []
      }
    />
  )
}
