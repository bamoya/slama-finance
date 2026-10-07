import '../lib/translations'

import { useQueryClient } from '@tanstack/react-query'
import { Download, RotateCcw } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'wouter'

import { FormError } from '../../../components/management/form-error'
import { PageHeader } from '../../../components/management/page-header'
import { EmptyState } from '../../../components/management/page-state'
import { RequestState } from '../../../components/management/request-state'
import { Button } from '../../../components/ui/button'
import { useUiLanguage } from '../../../lib/i18n'
import { Can } from '../../identity'
import { DocumentNotificationHistory, downloadArtifact } from '../../sales'
import { refreshSchedules, useReportRun, useScheduleActions } from '../api/queries'
import { ReportViewer } from '../components/report-viewer'
import { RunActions } from '../components/run-actions'
import { ScheduleRecipients } from '../components/schedule-recipients'
import { downloadReport } from '../lib/download'
import { formatReportInstant } from '../lib/schedule-display'
const VisualReport = lazy(() =>
  import('../components/visual-report').then((module) => ({ default: module.VisualReport })),
)

export function ReportRunPage() {
  useUiLanguage()

  const { t } = useTranslation('reports'),
    { runId = '' } = useParams<{ runId: string }>(),
    query = useReportRun(runId),
    actions = useScheduleActions(),
    cache = useQueryClient()
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>()
  const act = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError(undefined)
    try {
      await action()
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
    }
  }
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
        eyebrow={t(row.trigger === 'test' ? 'testRun' : 'frozen')}
        title={`${row.configurationSnapshot.name} · ${row.periodStart} – ${row.periodEnd}`}
        description={t(row.trigger === 'test' ? 'testRunHint' : 'frozenHint')}
        actions={
          <>
            <Can permission="reports.read">
              {row.artifacts.map((file) => (
                <Button
                  key={file.id}
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void act(async () =>
                      downloadReport(
                        await downloadArtifact(file.id, { responseType: 'blob' }),
                        `report-${row.periodStart}.${file.format}`,
                      ),
                    )
                  }
                >
                  <Download data-icon="inline-start" />
                  {t(
                    file.format === 'pdf'
                      ? 'exportPdf'
                      : file.format === 'xlsx'
                        ? 'exportExcel'
                        : 'exportCsv',
                  )}
                </Button>
              ))}
            </Can>
            {row.status === 'failed' && (
              <Can permission="reports.read">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await actions.retry(row.id)
                      await refreshSchedules(cache)
                    })
                  }
                >
                  <RotateCcw data-icon="inline-start" />
                  {t('retry')}
                </Button>
              </Can>
            )}
            <RunActions row={row} />
          </>
        }
      />
      <FormError error={error} />
      <section className="rounded-2xl border border-border bg-[var(--surface)] p-5">
        <strong>
          {t('production')}: {t(row.status)}
        </strong>
        {row.errorCode && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {row.errorCode}
          </p>
        )}
        <p className="mt-2 text-sm text-muted-foreground">
          {row.dataCapturedAt
            ? t('captured', {
                time: formatReportInstant(row.dataCapturedAt, row.configurationSnapshot.timezone),
              })
            : t('pendingCapture')}
        </p>
      </section>
      {row.dataSnapshot ? (
        row.dataSnapshot.snapshotVersion >= 2 ? (
          <Suspense fallback={null}>
            <VisualReport data={row.dataSnapshot} frozen />
          </Suspense>
        ) : (
          <ReportViewer data={row.dataSnapshot} frozen />
        )
      ) : (
        <EmptyState title={t('pendingCapture')} description={t('noArtifacts')} />
      )}
      <section className="grid gap-3 rounded-2xl border border-border bg-[var(--surface)] p-5">
        <h2 className="text-lg font-semibold">{t('delivery')}</h2>
        <p className="text-xs text-muted-foreground">{t('deliveryHint')}</p>
        <ScheduleRecipients
          ids={row.configurationSnapshot.recipientIds}
          sections={row.configurationSnapshot.includedSections}
          deliveries={row.deliveries}
        />
      </section>
      <Can permission="notification_dispatches.read">
        <DocumentNotificationHistory documentType="report_run" id={row.id} />
      </Can>
    </div>
  )
}
