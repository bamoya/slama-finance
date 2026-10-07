import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import type { ReportRun } from '../../../api/generated/schemas/reporting/reporting.schemas'
import { BulkActions } from '../../../components/management/bulk-actions'
import { Can } from '../../identity'
import { refreshSchedules, useRunCleanup } from '../api/queries'
import { canCleanRun, formatFileSize } from '../lib/run-management'

export function RunBulkActions({ selected, clear }: { selected: ReportRun[]; clear: () => void }) {
  const { t, i18n } = useTranslation('reports'),
    cache = useQueryClient(),
    cleanup = useRunCleanup()
  const clean = async (row: ReportRun, mode: 'files' | 'run') => {
    const result = await cleanup.mutateAsync({ id: row.id, data: { mode } })
    if (result.pendingFiles || result.retainedFiles)
      toast.info(
        t('cleanupResult', {
          size: formatFileSize(result.freedBytes, i18n.language),
          retained: result.retainedFiles,
          pending: result.pendingFiles,
        }),
      )
  }
  return (
    <Can permission="reports.read">
      <BulkActions
        selected={selected}
        clear={clear}
        name={(row) => `${row.periodStart} – ${row.periodEnd}`}
        refresh={() => refreshSchedules(cache)}
        actions={[
          {
            key: 'delete-files',
            label: t('cleanupFiles'),
            warning: t('cleanupFilesWarning'),
            eligible: (row) => canCleanRun(row) && row.artifacts.length > 0,
            run: (row) => clean(row, 'files'),
          },
          {
            key: 'delete',
            label: t('cleanupRun'),
            warning: t('cleanupRunWarning'),
            destructive: true,
            eligible: canCleanRun,
            run: (row) => clean(row, 'run'),
          },
        ]}
      />
    </Can>
  )
}
