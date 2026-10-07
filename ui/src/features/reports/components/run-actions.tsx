import { useQueryClient } from '@tanstack/react-query'
import { FileX2, RotateCcw, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useLocation } from 'wouter'

import type { ReportRun } from '../../../api/generated/schemas/reporting/reporting.schemas'
import { ConfirmAction } from '../../../components/management/confirm-action'
import { MoreActions } from '../../../components/management/more-actions'
import { Can } from '../../identity'
import { refreshSchedules, useRunCleanup, useRunRegenerate } from '../api/queries'
import { canCleanRun, formatFileSize, hasMissingFiles } from '../lib/run-management'

export function RunActions({ row, compact = false }: { row: ReportRun; compact?: boolean }) {
  const { t, i18n } = useTranslation('reports')
  const cache = useQueryClient()
  const cleanup = useRunCleanup(),
    regenerate = useRunRegenerate()
  const [, navigate] = useLocation()
  const clean = async (mode: 'files' | 'run') => {
    const result = await cleanup.mutateAsync({ id: row.id, data: { mode } })
    toast.success(
      t('cleanupResult', {
        size: formatFileSize(result.freedBytes, i18n.language),
        retained: result.retainedFiles,
        pending: result.pendingFiles,
      }),
    )
    if (mode === 'run' && !compact) navigate(`/reports/schedules/${row.scheduleId}`)
    await refreshSchedules(cache)
  }
  const disabled = cleanup.isPending || regenerate.isPending || !canCleanRun(row)
  return (
    <Can permission="reports.read">
      <MoreActions compact={compact} label={t('runActions')}>
        {row.status === 'succeeded' && hasMissingFiles(row) && (
          <ConfirmAction
            label={t('regenerateFiles')}
            description={t('regenerateFilesHint')}
            icon={<RotateCcw />}
            variant="outline"
            disabled={disabled}
            onConfirm={async () => {
              await regenerate.mutateAsync({ id: row.id })
              await refreshSchedules(cache)
            }}
          />
        )}
        <ConfirmAction
          label={t('cleanupFiles')}
          description={t('cleanupFilesWarning')}
          icon={<FileX2 />}
          variant="outline"
          disabled={disabled || row.artifacts.length === 0}
          onConfirm={() => clean('files')}
        />
        <ConfirmAction
          label={t('cleanupRun')}
          description={t('cleanupRunWarning')}
          icon={<Trash2 />}
          variant="destructive"
          disabled={disabled}
          onConfirm={() => clean('run')}
        />
      </MoreActions>
    </Can>
  )
}
