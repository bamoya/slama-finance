import '../lib/visual-translations'

import { useTranslation } from 'react-i18next'

import type {
  ReportAnalysis,
  ReportSection,
  ReportSectionKey,
} from '../../../api/generated/schemas/reporting/reporting.schemas'
import { Button } from '../../../components/ui/button'
import { useUiLanguage } from '../../../lib/i18n'
import { Can, useAuthorization } from '../../identity'
import { CollectionCalendar } from './collection-calendar'
import { ReportAttention } from './report-attention'
import { ReportSummary } from './report-summary'
import { VisualBreakdown } from './visual-breakdown'
import { VisualTrend } from './visual-trend'
type ReportVisualPoint = NonNullable<ReportSection['visuals']>[number]

export function VisualReport({
  data: snapshot,
  previous,
  onRecords,
  dashboard = false,
  frozen = false,
  onDay,
}: {
  data: ReportAnalysis
  previous?: ReportAnalysis
  dashboard?: boolean
  frozen?: boolean
  onRecords?: (section: ReportSectionKey, segment?: string, currency?: string) => void
  onDay?: (date: string, currency: string) => void
}) {
  useUiLanguage()

  const { t, i18n } = useTranslation('reportVisuals')
  const { t: reports } = useTranslation('reports')
  const { can } = useAuthorization()
  const data = {
    ...snapshot,
    sections: snapshot.sections.filter(() => can('reports.read')),
  }
  const currencies = data.currencies.length ? data.currencies : [data.filters.currency ?? 'MAD']
  const hasTrend = data.sections.some((section) => ['revenue', 'collections'].includes(section.key))
  // Outstanding already includes overdue balances. Keep one aging breakdown per
  // currency, without hiding overdue-only reports or older partial snapshots.
  const outstandingAgingCurrencies = new Set(
    data.sections
      .find((section) => section.key === 'outstanding')
      ?.visuals?.filter((point) => point.group === 'aging')
      .map((point) => point.currency) ?? [],
  )
  const select = (key: ReportSectionKey, group: string) =>
    onRecords &&
    [
      'aging',
      'ranking',
      'methods',
      'delivery_status',
      'delivery_billing',
      'cohort',
      'outcome',
    ].includes(group)
      ? (point: ReportVisualPoint) =>
          onRecords(
            key,
            ['cohort', 'outcome'].includes(group)
              ? `${group}:${point.key}`
              : group === 'delivery_billing'
                ? `billing:${point.key}`
                : point.key,
            point.currency ?? undefined,
          )
      : undefined
  return (
    <div className="grid min-w-0 gap-content">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <strong>{t(frozen ? 'frozen' : 'live')}</strong>
        <span>{t('period', data.filters)}</span>
        <span>
          {t('capture', {
            time: new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'en', {
              dateStyle: 'medium',
              timeStyle: 'short',
              timeZone: data.filters.timezone,
            }).format(new Date(data.capturedAt)),
          })}
        </span>
      </div>
      <ReportSummary data={data} previous={previous} dashboard={dashboard} />
      {!!data.sections.length &&
        data.sections.every((section) => section.total === 0 && !section.visuals?.length) && (
          <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
            {t('empty')} · {t('emptyHint')}
          </p>
        )}
      {(hasTrend || dashboard) && (
        <div
          className={
            dashboard && hasTrend
              ? 'grid gap-content xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'
              : 'grid gap-content'
          }
        >
          {hasTrend && (
            <div className="grid min-w-0 gap-content">
              {currencies.map((currency) => (
                <VisualTrend key={currency} data={data} previous={previous} currency={currency} />
              ))}
            </div>
          )}
          {dashboard && <ReportAttention data={data} onRecords={onRecords} />}
        </div>
      )}
      <div
        data-slot="report-panels"
        className="grid min-w-0 gap-content xl:grid-cols-2 xl:[&>:last-child:nth-child(odd)]:col-span-2"
      >
        {!dashboard &&
          data.filters.bucket === 'day' &&
          data.sections.some((s) => s.key === 'collections') &&
          currencies.map((currency) => (
            <CollectionCalendar key={currency} data={data} currency={currency} onDay={onDay} />
          ))}
        {data.sections
          .filter(
            (section) =>
              !dashboard ||
              ['outstanding', 'estimates', 'overdue', 'pending_cheques'].includes(section.key),
          )
          .map((section) => (
            <Can key={section.key} permission={'reports.read'}>
              {section.key === 'vat' &&
                currencies.map((currency) => (
                  <VisualBreakdown
                    key={currency}
                    title={`${t('composition')} · ${currency}`}
                    description={t('compositionHint')}
                    ring
                    points={section.metrics
                      .filter(
                        (metric) =>
                          metric.currency === currency && ['net', 'vat'].includes(metric.key),
                      )
                      .map((metric) => ({ ...metric, group: 'ranking', label: t(metric.key) }))}
                  />
                ))}
              {[...new Set(section.visuals?.map((point) => point.group) ?? [])]
                .filter((group) => !dashboard || group !== 'outcome')
                .flatMap((group) =>
                  [
                    ...new Set(
                      section.visuals!.filter((p) => p.group === group).map((p) => p.currency),
                    ),
                  ]
                    .filter(
                      (currency) =>
                        section.key !== 'overdue' ||
                        group !== 'aging' ||
                        !outstandingAgingCurrencies.has(currency),
                    )
                    .map((currency) => (
                      <VisualBreakdown
                        key={`${group}-${currency}`}
                        title={`${group === 'ranking' ? reports(`sections.${section.key}`) : t(group)}${currency ? ` · ${currency}` : ''}`}
                        description={
                          section.key === 'sales_by_category'
                            ? t('categoryBasis')
                            : group === 'aging'
                              ? t('agingHint')
                              : group === 'cohort' || group === 'outcome'
                                ? t('cohortHint')
                                : group.startsWith('delivery')
                                  ? t('deliveryHint')
                                  : reports(`basis.${section.timeBasis}`)
                        }
                        points={section.visuals!.filter(
                          (p) => p.group === group && p.currency === currency,
                        )}
                        ring={
                          ['methods', 'buyer_type', 'outcome', 'delivery_billing'].includes(
                            group,
                          ) ||
                          (section.key === 'sales_by_category' && group === 'ranking')
                        }
                        onSelect={select(section.key, group)}
                        footer={
                          onRecords && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => onRecords(section.key)}
                            >
                              {t('records')}
                            </Button>
                          )
                        }
                      />
                    )),
                )}
            </Can>
          ))}
      </div>
      {onRecords && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
          {data.sections
            .filter((section) => section.key !== 'summary')
            .map((section) => (
              <Button
                key={section.key}
                size="sm"
                variant="outline"
                onClick={() => onRecords(section.key)}
              >
                {reports(`sections.${section.key}`)}
              </Button>
            ))}
        </div>
      )}
      {!data.sections.length && (
        <p className="py-10 text-center text-muted-foreground">{t('empty')}</p>
      )}
    </div>
  )
}
