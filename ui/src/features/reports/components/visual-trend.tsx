import { useTranslation } from 'react-i18next'
import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts'

import type { ReportAnalysis } from '../../../api/generated/schemas/reporting/reporting.schemas'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '../../../components/ui/chart'
import { useUiLanguage } from '../../../lib/i18n'
import { AnalyticsPanel } from './analytics-panel'

export function VisualTrend({
  data,
  previous,
  currency,
}: {
  data: ReportAnalysis
  previous?: ReportAnalysis
  currency: string
}) {
  useUiLanguage()

  const { t, i18n } = useTranslation('reportVisuals')
  const money = (value: number) =>
    new Intl.NumberFormat(i18n.resolvedLanguage ?? 'en', { style: 'currency', currency }).format(
      value,
    )
  const series = (snapshot: ReportAnalysis | undefined, section: string) =>
    snapshot?.sections
      .find((item) => item.key === section)
      ?.series.filter((point) => point.currency === currency) ?? []
  const points = new Map<
    string,
    { date: string; invoiced: number; collected: number; previous?: number }
  >()
  // Fill missing day/week/month buckets; missing activity is zero, not a gap between observations.
  const date = new Date(`${data.filters.from}T12:00:00Z`)
  if (data.filters.bucket === 'week')
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
  if (data.filters.bucket === 'month') date.setUTCDate(1)
  while (date.toISOString().slice(0, 10) <= data.filters.to) {
    const key = date.toISOString().slice(0, 10)
    points.set(key, { date: key, invoiced: 0, collected: 0 })
    if (data.filters.bucket === 'month') date.setUTCMonth(date.getUTCMonth() + 1)
    else date.setUTCDate(date.getUTCDate() + (data.filters.bucket === 'week' ? 7 : 1))
  }
  for (const [section, metric] of [
    ['revenue', 'invoiced'],
    ['collections', 'collected'],
  ] as const)
    for (const point of series(data, section)) {
      const entry = points.get(point.date)
      if (entry) entry[metric] = Number(point.value)
    }
  const values = [...points.values()]
  // Day comparisons align ordinal days in two equal-duration periods.
  if (previous && data.filters.bucket === 'day') {
    const prior = new Map(
      series(previous, 'revenue').map((point) => [point.date, Number(point.value)]),
    )
    values.forEach((entry, index) => {
      const day = new Date(`${previous.filters.from}T12:00:00Z`)
      day.setUTCDate(day.getUTCDate() + index)
      entry.previous = prior.get(day.toISOString().slice(0, 10)) ?? 0
    })
  }
  return (
    <AnalyticsPanel
      title={`${t(data.sections.some((s) => s.key === 'revenue') ? (data.sections.some((s) => s.key === 'collections') ? 'trend' : 'salesTrend') : 'collectionsTrend')} · ${currency}`}
      description={t('trendHint')}
      footer={t('trendNote')}
    >
      <ChartContainer
        className="h-72 w-full"
        config={{
          invoiced: { label: t('invoiced'), color: 'var(--chart-1)' },
          collected: { label: t('collected'), color: 'var(--chart-2)' },
          previous: { label: t('previous'), color: 'var(--chart-3)' },
        }}
      >
        <ComposedChart data={values} accessibilityLayer margin={{ left: 0, right: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            minTickGap={30}
            tickFormatter={(date: string) => date.slice(5)}
          />
          <YAxis
            width={48}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) =>
              new Intl.NumberFormat(i18n.resolvedLanguage ?? 'en', { notation: 'compact' }).format(
                value,
              )
            }
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, name) => (
                  <span>
                    {t(String(name))}: <strong>{money(Number(value))}</strong>
                  </span>
                )}
              />
            }
          />
          {data.sections.some((section) => section.key === 'revenue') && (
            <Area
              dataKey="invoiced"
              type="monotone"
              stroke="var(--chart-1)"
              fill="var(--chart-1)"
              fillOpacity={0.12}
              strokeWidth={2}
              isAnimationActive={false}
            />
          )}
          {data.sections.some((section) => section.key === 'collections') && (
            <Line
              dataKey="collected"
              type="monotone"
              stroke="var(--chart-2)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          )}
          {previous && data.filters.bucket === 'day' && (
            <Line
              dataKey="previous"
              stroke="var(--chart-3)"
              strokeDasharray="5 5"
              dot={false}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ChartContainer>
      <div className="mt-3 flex flex-wrap gap-content text-xs text-muted-foreground">
        {previous && data.filters.bucket === 'day' && (
          <span className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-[var(--chart-3)]" />
            {t('previous')} · {previous.filters.from} – {previous.filters.to}
          </span>
        )}
        {['revenue', 'collections']
          .filter((key) => data.sections.some((section) => section.key === key))
          .map((key, index) => (
            <span key={key} className="flex items-center gap-2">
              <span
                className="size-2 rounded-full"
                style={{ background: `var(--chart-${index + 1})` }}
              />
              {t(key === 'revenue' ? 'invoiced' : 'collected')}
            </span>
          ))}
      </div>
    </AnalyticsPanel>
  )
}
