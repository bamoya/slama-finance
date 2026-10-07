import { useQueryClient } from '@tanstack/react-query'
import { Archive, Pencil, Play, RotateCcw, Square, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'wouter'

import type { ReportSchedule } from '../../../api/generated/schemas/reporting/reporting.schemas'
import { ConfirmAction } from '../../../components/management/confirm-action'
import { FormError } from '../../../components/management/form-error'
import { Button, buttonVariants } from '../../../components/ui/button'
import { useUiLanguage } from '../../../lib/i18n'
import { Can } from '../../identity'
import { refreshSchedules, useScheduleActions } from '../api/queries'
import { SendScheduleTest } from './send-schedule-test'

export function ScheduleActions({ schedule }: { schedule: ReportSchedule }) {
  useUiLanguage()

  const { t } = useTranslation('reports'),
    cache = useQueryClient(),
    [, navigate] = useLocation(),
    actions = useScheduleActions()
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>()
  const act = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError(undefined)
    try {
      await action()
      await refreshSchedules(cache)
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
    }
  }
  const data = { expectedVersion: schedule.version }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!schedule.archivedAt && (
        <>
          <SendScheduleTest schedule={schedule} disabled={busy} />
          <Can permission="reports.read">
            <Link
              href={`/reports/schedules/${schedule.id}/edit`}
              className={buttonVariants({ variant: 'outline' })}
            >
              <Pencil data-icon="inline-start" />
              {t('edit')}
            </Link>
          </Can>
          <Can permission={schedule.enabled ? 'reports.read' : 'reports.read'}>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void act(() =>
                  schedule.enabled
                    ? actions.disable(schedule.id, data)
                    : actions.enable(schedule.id, data),
                )
              }
            >
              {schedule.enabled ? (
                <Square data-icon="inline-start" />
              ) : (
                <Play data-icon="inline-start" />
              )}
              {t(schedule.enabled ? 'disable' : 'enable')}
            </Button>
          </Can>
          <Can permission="reports.read">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void act(() => actions.archive(schedule.id, data))}
            >
              <Archive data-icon="inline-start" />
              {t('archive')}
            </Button>
          </Can>
        </>
      )}
      {!!schedule.archivedAt && (
        <Can permission="reports.read">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void act(() => actions.restore(schedule.id, data))}
          >
            <RotateCcw data-icon="inline-start" />
            {t('restore')}
          </Button>
        </Can>
      )}
      <Can permission="reports.read">
        <ConfirmAction
          label={t('delete')}
          description={t('deleteWarning')}
          icon={<Trash2 />}
          variant="destructive"
          disabled={busy}
          onConfirm={async () => {
            await actions.delete(schedule.id, data)
            await refreshSchedules(cache)
            navigate('/reports/schedules')
          }}
        />
      </Can>
      <FormError error={error} />
    </div>
  )
}
