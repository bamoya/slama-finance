import '../lib/translations'
import '../lib/visual-translations'

import { CalendarClock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useSearch } from 'wouter'

import type {
  ReportCriteria,
  ReportSectionKey,
} from '../../../api/generated/schemas/reporting/reporting.schemas'
import { FormError } from '../../../components/management/form-error'
import { PageHeader } from '../../../components/management/page-header'
import { EmptyState } from '../../../components/management/page-state'
import { RequestState } from '../../../components/management/request-state'
import { buttonVariants } from '../../../components/ui/button'
import { Switch } from '../../../components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '../../../components/ui/tabs'
import { useUiLanguage } from '../../../lib/i18n'
import { Can, useAuthorization } from '../../identity'
import { useAnalysis, useReportSections } from '../api/queries'
import { ReportFilters } from '../components/report-filters'
import { ReportRecordsSheet } from '../components/report-records-sheet'
import { VisualReport } from '../components/visual-report'
import { useReportDownload } from '../lib/use-report-download'
import { useReportFilters } from '../lib/use-report-filters'

const topics: { key: string; sections: ReportSectionKey[] }[] = [
  { key: 'sales', sections: ['revenue', 'vat', 'sales_by_product', 'sales_by_category'] },
  {
    key: 'collections',
    sections: ['collections', 'outstanding', 'overdue', 'payment_methods', 'pending_cheques'],
  },
  { key: 'clients', sections: ['sales_by_client'] },
  { key: 'products', sections: ['sales_by_product', 'sales_by_category'] },
  { key: 'estimates', sections: ['estimates'] },
  { key: 'deliveries', sections: ['deliveries'] },
]
export function AnalyticsPage({ dashboard = false }: { dashboard?: boolean }) {
  useUiLanguage()

  const { t } = useTranslation('reportVisuals'),
    { t: reports } = useTranslation('reports')
  const { can } = useAuthorization()
  const { filters, invalid, set } = useReportFilters()
  const params = new URLSearchParams(useSearch())
  const available = topics.filter(() => can('reports.read'))
  const topic = available.find((item) => item.key === params.get('topic')) ?? available[0]
  const sections = (
    dashboard
      ? ([
          'summary',
          'revenue',
          'collections',
          'outstanding',
          'overdue',
          'pending_cheques',
          'estimates',
        ] as ReportSectionKey[])
      : (topic?.sections ?? [])
  ).filter(() => can('reports.read'))
  const criteria: ReportCriteria = {
    sort: 'date_desc',
    limit: 25,
    bucket: 'day',
    ...filters,
    sections,
    detailSection: undefined,
    segment: undefined,
    offset: 0,
    comparePrevious: params.get('compare') === 'true',
  }
  const query = useAnalysis(criteria, !invalid && sections.length > 0)
  const registry = useReportSections()
  const compare = params.get('compare') === 'true'
  const current = query.data?.filters
  const previous = query.data?.comparison
    ? {
        ...query.data,
        sections: query.data.comparison.sections,
        filters: {
          ...query.data.filters,
          from: query.data.comparison.from,
          to: query.data.comparison.to,
        },
      }
    : undefined
  const detailSection = sections.find((key) => key === filters?.detailSection)
  const details = useAnalysis(
    {
      ...criteria,
      sections: detailSection ? [detailSection] : sections,
      detailSection,
      segment: filters?.segment,
      offset: filters?.offset,
      from: params.get('recordDate') ?? criteria.from,
      to: params.get('recordDate') ?? criteria.to,
      currency: params.get('recordCurrency') ?? criteria.currency,
      comparePrevious: false,
    },
    !!detailSection && !invalid,
  )
  const { actions: exports, error } = useReportDownload(detailSection ? details.data : query.data)

  return (
    <div className="mx-auto grid min-w-0 max-w-[1500px] gap-content p-page">
      <PageHeader
        title={t(dashboard ? 'dashboard' : 'reports')}
        description={t('description')}
        actions={
          <>
            <Can permission="reports.read">
              <Link
                href="/reports/schedules"
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                <CalendarClock data-icon="inline-start" />
                {t('schedules')}
              </Link>
            </Can>
            {exports}
          </>
        }
      />
      <FormError error={error} />
      {!dashboard && (
        <Tabs
          value={topic?.key ?? ''}
          onValueChange={(value) =>
            set({
              topic: value,
              sections: undefined,
              detailSection: undefined,
              segment: undefined,
              productId: undefined,
              categoryId: undefined,
              currency: value === 'deliveries' ? undefined : filters?.currency,
            })
          }
        >
          <div className="overflow-x-auto rounded-2xl border border-border bg-card p-3">
            <TabsList variant="line" aria-label={t('topics')}>
              {available.map((item) => (
                <TabsTrigger key={item.key} value={item.key}>
                  {t(item.key)}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>
      )}
      {registry.data && (
        <ReportFilters
          visual
          filters={{
            ...criteria,
            from: filters?.from ?? current?.from,
            to: filters?.to ?? current?.to,
          }}
          registry={registry.data}
          set={(values) => set({ ...values, detailSection: undefined, segment: undefined })}
        />
      )}
      {sections.includes('revenue') && (
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={compare}
            onCheckedChange={(value) => set({ compare: value ? 'true' : undefined })}
          />
          {t('compare')}
        </label>
      )}
      {invalid ? (
        <EmptyState title={reports('invalid')} />
      ) : !sections.length ? (
        <EmptyState title={reports('noSections')} />
      ) : query.isPending || query.isError ? (
        <RequestState query={query} />
      ) : (
        <VisualReport
          data={query.data}
          previous={compare ? previous : undefined}
          dashboard={dashboard}
          onRecords={(key, segment, currency) =>
            set({ detailSection: key, segment, recordDate: undefined, recordCurrency: currency })
          }
          onDay={(date, currency) =>
            set({
              detailSection: 'collections',
              segment: undefined,
              recordDate: date,
              recordCurrency: currency,
            })
          }
        />
      )}
      <ReportRecordsSheet
        detailSection={detailSection}
        segment={filters?.segment}
        details={details}
        actions={exports}
        set={set}
      />
    </div>
  )
}
