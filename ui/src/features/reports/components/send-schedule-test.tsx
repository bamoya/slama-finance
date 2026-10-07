import { useQueryClient } from '@tanstack/react-query'
import { Mail } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'wouter'

import type { ReportSchedule } from '../../../api/generated/schemas/reporting/reporting.schemas'
import { ConfirmAction } from '../../../components/management/confirm-action'
import { Can } from '../../identity'
import { refreshSchedules, useScheduleTestEmail } from '../api/queries'

export function SendScheduleTest({
  schedule,
  disabled = false,
  iconOnly = false,
}: {
  schedule: ReportSchedule
  disabled?: boolean
  iconOnly?: boolean
}) {
  const { t } = useTranslation('reports')
  const action = useScheduleTestEmail(),
    cache = useQueryClient(),
    [, navigate] = useLocation()
  if (schedule.archivedAt) return null
  return (
    <Can permission="reports.read">
      <ConfirmAction
        label={t('sendTestEmail')}
        description={t('sendTestEmailHint')}
        icon={<Mail />}
        iconOnly={iconOnly}
        size={iconOnly ? 'icon-md' : 'default'}
        variant="outline"
        disabled={disabled || action.isPending}
        onConfirm={async () => {
          const run = await action.mutateAsync({
            id: schedule.id,
            data: { expectedVersion: schedule.version },
          })
          await refreshSchedules(cache)
          navigate(`/reports/runs/${run.id}`)
        }}
      />
    </Can>
  )
}
