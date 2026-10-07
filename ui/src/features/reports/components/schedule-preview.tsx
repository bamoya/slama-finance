import { CalendarClock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  type ReportSchedulePreviewInput,
  ReportSchedulePreviewInputSchema,
} from '../../../api/generated/schemas/reporting/schedule-preview.schemas'
import { FormError } from '../../../components/management/form-error'
import { Button } from '../../../components/ui/button'
import { useUiLanguage } from '../../../lib/i18n'
import { useSchedulePreview } from '../api/queries'
import { formatReportInstant } from '../lib/schedule-display'

export function SchedulePreview({ configuration }: { configuration: ReportSchedulePreviewInput }) {
  useUiLanguage()

  const { t } = useTranslation('reports')
  const preview = useSchedulePreview()
  const valid = ReportSchedulePreviewInputSchema.safeParse(configuration).success
  const current = JSON.stringify(preview.variables?.data) === JSON.stringify(configuration)
  return (
    <div className="grid gap-3 rounded-2xl border border-border p-4" aria-live="polite">
      <Button
        type="button"
        variant="outline"
        disabled={!valid || preview.isPending}
        onClick={() => preview.mutate({ data: configuration })}
      >
        <CalendarClock data-icon="inline-start" />
        {t('previewCalendar')}
      </Button>
      <p className="text-xs text-muted-foreground">{t('previewCalendarHint')}</p>
      {current && preview.error && <FormError error={preview.error} />}
      {current && preview.data && (
        <p className="text-sm">
          {t('previewCalendarResult', {
            time: formatReportInstant(preview.data.nextRunAt, preview.data.timezone),
            from: preview.data.periodStart,
            to: preview.data.periodEnd,
          })}
        </p>
      )}
    </div>
  )
}
