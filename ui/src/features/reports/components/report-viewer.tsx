import '../lib/translations'

import { useTranslation } from 'react-i18next'
import { Link } from 'wouter'

import type {
  ReportAnalysis,
  ReportSection,
} from '../../../api/generated/schemas/reporting/reporting.schemas'
import { DataTable } from '../../../components/management/data-table'
import { DataTablePagination } from '../../../components/management/data-table-pagination'
import { EmptyState } from '../../../components/management/page-state'
import { StatsGrid } from '../../../components/management/stats-grid'
import { useUiLanguage } from '../../../lib/i18n'
import { Can } from '../../identity'
import { formatReportInstant } from '../lib/schedule-display'

function owner(section: ReportSection, status: string | null) {
  if (section.key === 'estimates' && status === 'converted_invoice') return 'invoices'
  if (['revenue', 'outstanding', 'overdue', 'vat'].includes(section.key)) return 'invoices'
  if (['collections', 'pending_cheques'].includes(section.key)) return 'payments'
  if (section.key === 'sales_by_client') return 'clients'
  if (section.key === 'sales_by_product') return 'products'
  if (section.key === 'sales_by_category') return 'products/categories'
  if (section.key === 'estimates') return 'estimates'
  if (section.key === 'deliveries') return 'delivery-notes'
}

export function ReportViewer({
  data,
  frozen = false,
  overview = false,
  recordsOnly = false,
  onOffset,
  fetching = false,
}: {
  data: ReportAnalysis
  frozen?: boolean
  overview?: boolean
  recordsOnly?: boolean
  onOffset?: (offset: number) => void
  fetching?: boolean
}) {
  useUiLanguage()

  const { t } = useTranslation('reports')
  if (!data.sections.length)
    return <EmptyState title={t('noSections')} description={t('noSectionsHint')} />
  return (
    <div className="grid gap-section">
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
        <strong>{t(frozen ? 'frozen' : 'live')}</strong>
        <span>{t('period', data.filters)}</span>
        <span>
          {t('captured', { time: formatReportInstant(data.capturedAt, data.filters.timezone) })}
        </span>
      </div>
      {data.sections.map((section) => (
        <Can key={section.key} permission={'reports.read'}>
          <section className="grid min-w-0 gap-4 rounded-panel border border-border bg-[var(--surface)] p-4 md:p-panel">
            <div>
              <h2 className="text-lg font-semibold">{t(`sections.${section.key}`)}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(`basis.${section.timeBasis}`)}
              </p>
              {section.coverage && (
                <p className="mt-2 text-sm text-muted-foreground">{section.coverage}</p>
              )}
            </div>
            {!recordsOnly && (
              <StatsGrid
                items={section.metrics.map((metric) => ({
                  label: `${t(`metrics.${metric.key}`)}${metric.currency ? ` · ${metric.currency}` : ''}`,
                  value: `${metric.value}${metric.unit === 'kg' ? ' kg' : metric.unit === 'money' && metric.currency ? ` ${metric.currency}` : ''}`,
                  detail: t(`basis.${metric.timeBasis}`),
                }))}
              />
            )}
            {!recordsOnly && !!section.series.length && <ReportSeries section={section} />}
            {!overview && (
              <DataTable
                items={section.rows.map((row, index) => ({
                  ...row,
                  sourceId: row.id,
                  id: `${section.key}-${row.id ?? 'manual'}-${row.currency ?? ''}-${row.status ?? ''}-${index}`,
                }))}
                emptyTitle={t('empty')}
                emptyDescription={t('emptyHint')}
                columns={[
                  {
                    title: t('name'),
                    render: (row) => {
                      const path =
                          row.resource === 'delivery_notes'
                            ? 'delivery-notes'
                            : row.resource === 'categories'
                              ? 'products/categories'
                              : (row.resource ?? owner(section, row.status)),
                        resource =
                          path === 'products/categories'
                            ? 'categories'
                            : path === 'delivery-notes'
                              ? 'delivery_notes'
                              : path
                      return path && row.sourceId && /^[0-9a-f-]{36}$/i.test(row.sourceId) ? (
                        <Can permission={`${resource}.read`} fallback={<span>{row.label}</span>}>
                          <Link
                            className="text-[var(--accent)] underline"
                            href={`/${path}/${row.sourceId}`}
                          >
                            {row.label}
                          </Link>
                        </Can>
                      ) : (
                        row.label
                      )
                    },
                  },
                  { title: t('date'), render: (row) => row.date ?? '—' },
                  {
                    title: t('status'),
                    render: (row) => (row.status ? t(`statuses.${row.status}`) : '—'),
                  },
                  { title: t('currency'), render: (row) => row.currency ?? '—' },
                  { title: t('net'), render: (row) => row.net ?? '—', align: 'right' },
                  { title: t('vat'), render: (row) => row.vat ?? '—', align: 'right' },
                  {
                    title: t('amount'),
                    render: (row) => row.amount ?? row.gross ?? '—',
                    align: 'right',
                  },
                  { title: t('quantity'), render: (row) => row.quantity ?? '—', align: 'right' },
                  {
                    title: t('weight'),
                    render: (row) => (
                      <span>
                        {row.weightKg ?? '—'}
                        {row.unknownWeightCount > 0 && (
                          <small className="block">
                            {t('unknownWeight', { count: row.unknownWeightCount })}
                          </small>
                        )}
                      </span>
                    ),
                    align: 'right',
                  },
                ]}
              />
            )}
            {!overview && onOffset ? (
              <DataTablePagination
                total={section.total}
                offset={section.offset}
                limit={section.limit}
                onOffset={onOffset}
                disabled={fetching}
              />
            ) : (
              !overview && (
                <p className="text-xs text-muted-foreground">
                  {t('count', { total: section.total })}
                </p>
              )
            )}
          </section>
        </Can>
      ))}
    </div>
  )
}

function ReportSeries({ section }: { section: ReportSection }) {
  useUiLanguage()

  const { t } = useTranslation('reports')
  return (
    <div className="grid gap-4">
      {Array.from(new Set(section.series.map((point) => point.currency))).map((currency) => {
        const points = section.series.filter((point) => point.currency === currency)
        const max = Math.max(1, ...points.map((point) => Number(point.value)))
        return (
          <figure key={currency} className="overflow-x-auto">
            <figcaption className="mb-2 text-sm">
              {t('series')} · {currency}
            </figcaption>
            <div className="flex min-w-max items-end gap-3 border-b border-border pb-2">
              {points.map((point, index) => (
                <div
                  key={`${point.date}-${point.key}-${index}`}
                  className="grid w-20 gap-2 text-center"
                >
                  <span className="text-xs tabular-nums">{point.value}</span>
                  <div className="flex h-32 items-end justify-center">
                    <div
                      className="w-8 rounded-t bg-[var(--accent)]"
                      style={{ height: `${Math.max(1, (Number(point.value) / max) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {point.date}
                    <br />
                    {t(`metrics.${point.key}`)}
                  </span>
                </div>
              ))}
            </div>
          </figure>
        )
      })}
    </div>
  )
}
