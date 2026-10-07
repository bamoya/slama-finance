import '../lib/translations'

import { useTranslation } from 'react-i18next'
import { useLocation, useParams, useSearch } from 'wouter'

import { PageHeader } from '../../../components/management/page-header'
import { RequestState } from '../../../components/management/request-state'
import { useUiLanguage } from '../../../lib/i18n'
import { Can } from '../../identity'
import { useReportSchedule } from '../api/queries'
import { RunHistory } from '../components/run-history'
import { ScheduleActions } from '../components/schedule-actions'
import { ScheduleRecipients } from '../components/schedule-recipients'
import { formatReportInstant } from '../lib/schedule-display'

export function ReportScheduleDetailPage({ runsOnly = false }: { runsOnly?: boolean }) {
  useUiLanguage()

  const { t } = useTranslation('reports'),
    { scheduleId = '' } = useParams<{ scheduleId: string }>(),
    search = useSearch(),
    [path, navigate] = useLocation(),
    query = useReportSchedule(scheduleId)
  if (query.isPending || query.isError)
    return (
      <div className="mx-auto max-w-[1500px] p-page">
        <RequestState query={query} />
      </div>
    )
  const row = query.data
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <PageHeader
        eyebrow={t('schedules')}
        title={row.name}
        description={t('scheduleDescription')}
        actions={<ScheduleActions schedule={row} />}
      />
      {!runsOnly && (
        <section className="grid gap-4 rounded-panel border border-border bg-[var(--surface)] p-panel">
          <h2 className="text-lg font-semibold">{t('configuration')}</h2>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">{t('reportLanguage')}</dt>
              <dd>{t(`languages.${row.language}`)}</dd>
              <dt>{t('output')}</dt>
              <dd>{t(`outputs.${row.output ?? 'pdf'}`)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t('frequency')}</dt>
              <dd>
                {t(row.frequency)} · {row.localTime} · {row.timezone}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t('nextRun')}</dt>
              <dd>{row.nextRunAt ? formatReportInstant(row.nextRunAt, row.timezone) : '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t('periodChoice')}</dt>
              <dd>{t(row.period)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t('sectionsTitle')}</dt>
              <dd>{row.includedSections.map((key) => t(`sections.${key}`)).join(', ')}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t('recipients')}</dt>
              <dd>
                <ScheduleRecipients ids={row.recipientIds} sections={row.includedSections} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t('status')}</dt>
              <dd>{t(row.archivedAt ? 'archived' : row.enabled ? 'enabled' : 'disabled')}</dd>
            </div>
          </dl>
          <p className="text-sm text-muted-foreground">
            {t('preview', { period: t(row.period), timezone: row.timezone })}
          </p>
          <p className="text-sm text-muted-foreground">{t('recipientHint')}</p>
        </section>
      )}
      <Can permission="reports.read">
        <RunHistory
          id={scheduleId}
          offset={Math.max(0, Number(new URLSearchParams(search).get('offset')) || 0)}
          onOffset={(offset) => navigate(`${path}?offset=${offset}`, { replace: true })}
        />
      </Can>
    </div>
  )
}
