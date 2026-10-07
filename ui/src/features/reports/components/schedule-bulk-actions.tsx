import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import type { ReportSchedule } from '../../../api/generated/schemas/reporting/reporting.schemas'
import { BulkActions } from '../../../components/management/bulk-actions'
import { Can } from '../../identity'
import { refreshSchedules, useScheduleActions } from '../api/queries'

export function ScheduleBulkActions({
  selected,
  clear,
}: {
  selected: ReportSchedule[]
  clear: () => void
}) {
  const { t } = useTranslation('reports')
  const cache = useQueryClient()
  const actions = useScheduleActions()
  return (
    <Can permission="reports.read">
      <BulkActions
        selected={selected}
        clear={clear}
        name={(row) => row.name}
        refresh={() => refreshSchedules(cache)}
        actions={[
          {
            key: 'enable',
            label: t('enable'),
            eligible: (row) => !row.archivedAt && !row.enabled,
            run: (row) => actions.enable(row.id, { expectedVersion: row.version }),
          },
          {
            key: 'disable',
            label: t('disable'),
            eligible: (row) => !row.archivedAt && row.enabled,
            run: (row) => actions.disable(row.id, { expectedVersion: row.version }),
          },
          {
            key: 'restore',
            label: t('restore'),
            eligible: (row) => !!row.archivedAt,
            run: (row) => actions.restore(row.id, { expectedVersion: row.version }),
          },
          {
            key: 'archive',
            label: t('archive'),
            eligible: (row) => !row.archivedAt,
            run: (row) => actions.archive(row.id, { expectedVersion: row.version }),
          },
          {
            key: 'delete',
            label: t('delete'),
            destructive: true,
            warning: t('deleteWarning'),
            run: (row) => actions.delete(row.id, { expectedVersion: row.version }),
          },
        ]}
      />
    </Can>
  )
}
