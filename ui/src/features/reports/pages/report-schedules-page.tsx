import '../lib/translations'

import { Pencil, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useSearch } from 'wouter'

import { DataTable } from '../../../components/management/data-table'
import { DataTablePagination } from '../../../components/management/data-table-pagination'
import { DataTableToolbar } from '../../../components/management/data-table-toolbar'
import { PageHeader } from '../../../components/management/page-header'
import { RequestState } from '../../../components/management/request-state'
import { StatusBadge } from '../../../components/management/status-badge'
import { useTableSelection } from '../../../components/management/use-table-selection'
import { buttonVariants } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Select, SelectGroup, SelectOption } from '../../../components/ui/select'
import { useUiLanguage } from '../../../lib/i18n'
import { Can, useAuthorization } from '../../identity'
import { useReportSchedules } from '../api/queries'
import { ScheduleBulkActions } from '../components/schedule-bulk-actions'
import { SendScheduleTest } from '../components/send-schedule-test'
import { formatReportInstant } from '../lib/schedule-display'

export function ReportSchedulesPage() {
  useUiLanguage()

  const { t } = useTranslation('reports')
  const { can } = useAuthorization()
  const search = useSearch(),
    [, navigate] = useLocation(),
    params = new URLSearchParams(search)
  const frequency = params.get('frequency')
  const status = params.get('status')
  const query = useReportSchedules({
    search: params.get('search') || undefined,
    frequency:
      frequency === 'daily' || frequency === 'weekly' || frequency === 'monthly'
        ? frequency
        : undefined,
    status: status === 'disabled' || status === 'archived' || status === 'all' ? status : 'active',
    limit: [10, 25, 50].includes(Number(params.get('limit'))) ? Number(params.get('limit')) : 25,
    offset: Math.max(0, Number(params.get('offset')) || 0),
  })
  const selection = useTableSelection(query.data?.items ?? [], search)
  const set = (key: string, value: string) => {
    if (value) params.set(key, value)
    else params.delete(key)
    if (key !== 'offset') params.delete('offset')
    navigate(`/reports/schedules?${params}`, { replace: true })
  }
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <PageHeader
        eyebrow={t('title')}
        title={t('schedules')}
        description={t('scheduleDescription')}
        actions={
          <Can permission="reports.read">
            <Link href="/reports/schedules/new" className={buttonVariants({})}>
              <Plus data-icon="inline-start" />
              {t('newSchedule')}
            </Link>
          </Can>
        }
      />
      <section className="overflow-hidden rounded-panel border border-border bg-[var(--surface)]">
        <DataTableToolbar>
          <Input
            className="table-search"
            aria-label={t('search')}
            placeholder={t('search')}
            value={params.get('search') ?? ''}
            onChange={(e) => set('search', e.target.value)}
          />
          <Select
            className="table-filter"
            aria-label={t('frequency')}
            value={frequency ?? ''}
            onValueChange={(v) => set('frequency', v)}
          >
            <SelectGroup>
              <SelectOption value="">{t('all')}</SelectOption>
              {['daily', 'weekly', 'monthly'].map((v) => (
                <SelectOption key={v} value={v}>
                  {t(v)}
                </SelectOption>
              ))}
            </SelectGroup>
          </Select>
          <Select
            className="table-filter"
            aria-label={t('status')}
            value={status ?? 'active'}
            onValueChange={(v) => set('status', v)}
          >
            <SelectGroup>
              {['active', 'disabled', 'archived', 'all'].map((v) => (
                <SelectOption key={v} value={v}>
                  {t(v === 'active' ? 'enabled' : v)}
                </SelectOption>
              ))}
            </SelectGroup>
          </Select>
        </DataTableToolbar>
        {query.isPending || query.isError ? (
          <RequestState query={query} />
        ) : (
          <>
            <ScheduleBulkActions selected={selection.selected} clear={selection.clear} />
            <DataTable
              items={query.data.items}
              selection={can('reports.read') ? selection : undefined}
              selectionName={(row) => row.name}
              emptyTitle={t('empty')}
              emptyDescription={t('scheduleDescription')}
              columns={[
                {
                  title: t('scheduleName'),
                  render: (row) => (
                    <Link
                      href={`/reports/schedules/${row.id}`}
                      className="text-[var(--accent)] underline"
                    >
                      {row.name}
                    </Link>
                  ),
                },
                {
                  title: t('frequency'),
                  render: (row) => (
                    <span>
                      {t(row.frequency)} · {row.localTime}
                      <small className="block text-muted-foreground">{row.timezone}</small>
                    </span>
                  ),
                },
                { title: t('recipients'), render: (row) => row.recipientIds.length },
                {
                  title: t('nextRun'),
                  render: (row) =>
                    row.nextRunAt ? formatReportInstant(row.nextRunAt, row.timezone) : '—',
                },
                {
                  title: t('status'),
                  render: (row) => (
                    <StatusBadge
                      label={t(row.archivedAt ? 'archived' : row.enabled ? 'enabled' : 'disabled')}
                      tone={row.archivedAt ? 'archived' : row.enabled ? 'active' : 'draft'}
                    />
                  ),
                },
                {
                  title: t('actions'),
                  render: (row) => (
                    <div className="flex items-center justify-end gap-2">
                      <Can permission="reports.read">
                        {!row.archivedAt && (
                          <Link
                            href={`/reports/schedules/${row.id}/edit`}
                            aria-label={`${t('edit')} ${row.name}`}
                            title={`${t('edit')} ${row.name}`}
                            className={buttonVariants({ variant: 'outline', size: 'icon-md' })}
                          >
                            <Pencil aria-hidden="true" />
                          </Link>
                        )}
                      </Can>
                      <SendScheduleTest schedule={row} iconOnly />
                    </div>
                  ),
                  align: 'right',
                },
              ]}
            />
            <DataTablePagination
              onPageSizeChange={(size) => set('limit', String(size))}
              disabled={query.isFetching}
              total={query.data.total}
              limit={query.data.limit}
              offset={query.data.offset}
              onOffset={(v) => set('offset', String(v))}
            />
          </>
        )}
      </section>
    </div>
  )
}
