import i18n from '../../../lib/i18n'
import { registerTranslations } from '../../../lib/i18n'

registerTranslations('reports', {
  previewCalendar: 'Preview next occurrence',
  previewCalendarHint: 'Calendar preview only. Saving this form is a separate action.',
  previewCalendarResult: 'Runs {{time}}. Includes {{from}} through {{to}} (inclusive).',
  enablePermissionHint: 'Enabling a schedule requires the schedule enable permission.',
})

export function formatReportInstant(value: string, timezone: string) {
  return (
    new Intl.DateTimeFormat(i18n.language, {
      timeZone: timezone,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value)) + ` · ${timezone}`
  )
}
