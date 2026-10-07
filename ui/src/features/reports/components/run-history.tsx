import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'wouter'

import { DataTable } from '../../../components/management/data-table'
import { DataTablePagination } from '../../../components/management/data-table-pagination'
import { DataTableToolbar } from '../../../components/management/data-table-toolbar'
import { RequestState } from '../../../components/management/request-state'
import { useTableSelection } from '../../../components/management/use-table-selection'
import { Badge } from '../../../components/ui/badge'
import { DateRangePicker } from '../../../components/ui/date-range-picker'
import { Input } from '../../../components/ui/input'
import { Select, SelectGroup, SelectOption } from '../../../components/ui/select'
import { useUiLanguage } from '../../../lib/i18n'
import { useAuthorization } from '../../identity'
import { useReportRuns } from '../api/queries'
import { formatFileSize } from '../lib/run-management'
import { formatReportInstant } from '../lib/schedule-display'
import { RunActions } from './run-actions'
import { RunBulkActions } from './run-bulk-actions'

export function RunHistory({
  id,
  offset,
  onOffset,
}: {
  id: string
  offset: number
  onOffset: (offset: number) => void
}) {
  useUiLanguage()

  const { t, i18n } = useTranslation('reports')
  const { can } = useAuthorization()
  const [filters, setFilters] = useState<NonNullable<Parameters<typeof useReportRuns>[1]>>({})
  const query = useReportRuns(id, { ...filters, offset, limit: 25 })
  const selection = useTableSelection(
    query.data?.items ?? [],
    JSON.stringify({ id, offset, filters }),
  )
  const set = (next: typeof filters) => {
    setFilters(next)
    onOffset(0)
  }
  return (
    <section className="overflow-hidden rounded-panel border border-border bg-[var(--surface)]">
      <h2 className="p-5 text-lg font-semibold">{t('history')}</h2>
      <DataTableToolbar onReset={Object.values(filters).some(Boolean) ? () => set({}) : undefined}>
        <Input
          className="table-search"
          placeholder={t('runSearch')}
          aria-label={t('runSearch')}
          value={filters.search ?? ''}
          onChange={(event) => set({ ...filters, search: event.target.value })}
        />
        <Select
          className="table-filter"
          aria-label={t('runStatus')}
          value={filters.status ?? ''}
          onValueChange={(value) =>
            set({ ...filters, status: (value as typeof filters.status) || undefined })
          }
        >
          <SelectGroup>
            <SelectOption value="">{t('runStatus')}</SelectOption>
            {['queued', 'running', 'succeeded', 'failed', 'cancelled'].map((status) => (
              <SelectOption key={status} value={status}>
                {t(status)}
              </SelectOption>
            ))}
          </SelectGroup>
        </Select>
        <Select
          className="table-filter"
          aria-label={t('runType')}
          value={filters.trigger ?? ''}
          onValueChange={(value) =>
            set({ ...filters, trigger: (value as typeof filters.trigger) || undefined })
          }
        >
          <SelectGroup>
            <SelectOption value="">{t('runType')}</SelectOption>
            {['scheduled', 'test'].map((trigger) => (
              <SelectOption key={trigger} value={trigger}>
                {t(trigger)}
              </SelectOption>
            ))}
          </SelectGroup>
        </Select>
        <div className="table-filter">
          <DateRangePicker
            from={filters.from}
            to={filters.to}
            onChange={(from, to) =>
              set({ ...filters, from: from || undefined, to: to || undefined })
            }
          />
        </div>
      </DataTableToolbar>
      {query.data && (
        <p className="px-5 py-3 text-sm text-muted-foreground">
          {t('storageTotal', { size: formatFileSize(query.data.storageBytes, i18n.language) })}
        </p>
      )}
      <RunBulkActions selected={selection.selected} clear={selection.clear} />
      {query.isPending || query.isError ? (
        <RequestState query={query} />
      ) : (
        <>
          <DataTable
            selection={can('reports.read') ? selection : undefined}
            selectionName={(row) => `${row.periodStart} – ${row.periodEnd}`}
            items={query.data.items}
            emptyTitle={t('noRuns')}
            emptyDescription={t('noRunsHint')}
            columns={[
              {
                title: t('run'),
                render: (row) => (
                  <Link href={`/reports/runs/${row.id}`} className="text-[var(--accent)] underline">
                    {formatReportInstant(row.scheduledFor, row.configurationSnapshot.timezone)}
                    {row.trigger === 'test' && (
                      <Badge variant="secondary" className="ml-2">
                        {t('testRun')}
                      </Badge>
                    )}
                  </Link>
                ),
              },
              {
                title: t('periodChoice'),
                render: (row) => `${row.periodStart} – ${row.periodEnd}`,
              },
              { title: t('production'), render: (row) => t(row.status) },
              {
                title: t('captured', { time: '' }),
                render: (row) =>
                  row.dataCapturedAt
                    ? formatReportInstant(row.dataCapturedAt, row.configurationSnapshot.timezone)
                    : '—',
              },
              {
                title: t('delivery'),
                render: (row) =>
                  row.deliveries.map((delivery) => t(delivery.status)).join(', ') || '—',
              },
              {
                title: t('filesSize'),
                render: (row) =>
                  row.artifacts.length
                    ? `${row.artifacts.map((file) => file.format.toUpperCase()).join(' / ')} · ${formatFileSize(
                        row.artifacts.reduce((sum, file) => sum + file.byteSize, 0),
                        i18n.language,
                      )}`
                    : t(row.status === 'succeeded' ? 'filesRemoved' : 'noArtifacts'),
              },
              {
                title: t('runActions'),
                align: 'right',
                render: (row) => <RunActions row={row} compact />,
              },
            ]}
          />
          <DataTablePagination
            total={query.data.total}
            offset={query.data.offset}
            limit={query.data.limit}
            onOffset={onOffset}
          />
        </>
      )}
    </section>
  )
}
