import { useTranslation } from 'react-i18next'

import type {
  ReportRecipientDelivery,
  ReportSectionKey,
} from '../../../api/generated/schemas/reporting/reporting.schemas'
import { useUiLanguage } from '../../../lib/i18n'
import { useReportRecipients } from '../api/queries'

/** Display only the authorized recipient directory; revoked/archived staff have an honest fallback. */
export function ScheduleRecipients({
  ids,
  sections,
  deliveries,
}: {
  ids: string[]
  sections: ReportSectionKey[]
  deliveries?: ReportRecipientDelivery[]
}) {
  useUiLanguage()

  const { t } = useTranslation('reports')
  const query = useReportRecipients({ sections, limit: 100 }, sections.length > 0)
  return (
    <ul className="grid min-w-0 gap-2">
      {ids.map((id) => {
        const staff = query.data?.items.find((row) => row.id === id),
          delivery = deliveries?.find((row) => row.userId === id)
        return (
          <li key={id} className="min-w-0 break-words text-sm">
            {staff
              ? `${staff.name} · ${staff.email}`
              : t(query.isPending ? 'loadingRecipient' : 'unavailableRecipient')}
            {delivery
              ? ` · ${t(delivery.status)}${delivery.reason ? ` · ${delivery.reason}` : ''}`
              : ''}
          </li>
        )
      })}
    </ul>
  )
}
