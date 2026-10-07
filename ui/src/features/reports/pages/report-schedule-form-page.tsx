import '../lib/translations'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'wouter'

import { PageHeader } from '../../../components/management/page-header'
import { RequestState } from '../../../components/management/request-state'
import { useUiLanguage } from '../../../lib/i18n'
import { useReportSchedule } from '../api/queries'
import { ScheduleForm } from '../components/schedule-form'

export function ReportScheduleFormPage() {
  useUiLanguage()

  const { t } = useTranslation('reports'),
    { scheduleId = '' } = useParams<{ scheduleId: string }>(),
    query = useReportSchedule(scheduleId, !!scheduleId)
  const [reloadKey, setReloadKey] = useState(0)
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <PageHeader
        eyebrow={t('schedules')}
        title={t(scheduleId ? 'edit' : 'newSchedule')}
        description={t('scheduleDescription')}
      />
      {scheduleId && (query.isPending || query.isError) ? (
        <RequestState query={query} />
      ) : (
        <ScheduleForm
          key={`${scheduleId}-${reloadKey}`}
          schedule={query.data}
          onReload={async () => {
            await query.refetch()
            setReloadKey((key) => key + 1)
          }}
        />
      )}
    </div>
  )
}
