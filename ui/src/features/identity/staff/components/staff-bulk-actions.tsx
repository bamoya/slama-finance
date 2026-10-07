import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import type { StaffPage } from '../../../../api/generated/schemas/identity/staff.schemas'
import { type BulkAction, BulkActions } from '../../../../components/management/bulk-actions'
import { useUiLanguage } from '../../../../lib/i18n'
import { useAuthorization } from '../../auth/hooks/use-authorization'
import { useSession } from '../../auth/hooks/use-session'
import { refreshIdentity, useStaffActions } from '../../shared/queries'

type Row = StaffPage['items'][number]
export function StaffBulkActions({ selected, clear }: { selected: Row[]; clear: () => void }) {
  useUiLanguage()

  const { t } = useTranslation('bulk')
  const { can } = useAuthorization()
  const session = useSession()
  const cache = useQueryClient()
  const api = useStaffActions()
  const actions: BulkAction<Row>[] = []
  for (const key of ['disable', 'enable', 'archive'] as const) {
    if (can('staff.update'))
      actions.push({
        key,
        label: t(key),
        destructive: key === 'archive',
        warning: t('staffWarning'),
        eligible: (row) =>
          row.id !== session.data?.user.id &&
          !row.archivedAt &&
          (key === 'archive' || (key === 'disable' ? !row.disabledAt : !!row.disabledAt)),
        run: (row) => api[key](row.id),
      })
  }
  return (
    <BulkActions
      selected={selected}
      actions={actions}
      name={(row) => row.email}
      clear={clear}
      refresh={() => refreshIdentity(cache)}
    />
  )
}
