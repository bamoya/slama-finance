import { useTranslation } from 'react-i18next'

import type { ReportAnalysis } from '../../../api/generated/schemas/reporting/reporting.schemas'
import { Button } from '../../../components/ui/button'
import { useUiLanguage } from '../../../lib/i18n'
import { AnalyticsPanel } from './analytics-panel'

export function CollectionCalendar({
  data,
  currency,
  onDay,
}: {
  data: ReportAnalysis
  currency: string
  onDay?: (date: string, currency: string) => void
}) {
  useUiLanguage()

  const { t, i18n } = useTranslation('reportVisuals')
  const points =
    data.sections
      .find((section) => section.key === 'collections')
      ?.series.filter((point) => point.currency === currency) ?? []
  const amounts = new Map(points.map((point) => [point.date, Number(point.value)]))
  const max = Math.max(1, ...amounts.values())
  const months = new Map<string, string[]>()
  for (
    const day = new Date(`${data.filters.from}T12:00:00Z`);
    day.toISOString().slice(0, 10) <= data.filters.to;
    day.setUTCDate(day.getUTCDate() + 1)
  ) {
    const date = day.toISOString().slice(0, 10),
      month = date.slice(0, 7)
    if (!months.has(month)) months.set(month, [])
    months.get(month)!.push(date)
  }
  return (
    <AnalyticsPanel title={`${t('calendar')} · ${currency}`} description={t('calendarHint')}>
      <div className="grid gap-section sm:grid-cols-2">
        {[...months].map(([month, days]) => (
          <div key={month}>
            <h4 className="mb-2 text-sm font-medium">
              {new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'en', {
                month: 'long',
                year: 'numeric',
                timeZone: 'UTC',
              }).format(new Date(`${month}-01T12:00:00Z`))}
            </h4>
            <div className="grid grid-cols-7 gap-1">
              {days.map((date, index) => {
                const value = amounts.get(date) ?? 0,
                  amount = new Intl.NumberFormat(i18n.resolvedLanguage ?? 'en', {
                    style: 'currency',
                    currency,
                  }).format(value)
                return (
                  <Button
                    key={date}
                    size="cell"
                    variant="ghost"
                    disabled={!onDay}
                    title={t('dayAmount', { date, amount })}
                    aria-label={t('dayAmount', { date, amount })}
                    onClick={() => onDay?.(date, currency)}
                    style={{
                      gridColumnStart:
                        index === 0
                          ? ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1
                          : undefined,
                      background: value
                        ? `color-mix(in srgb, var(--chart-2) ${15 + (value / max) * 65}%, var(--surface))`
                        : 'var(--surface-muted)',
                    }}
                  >
                    {Number(date.slice(8))}
                  </Button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </AnalyticsPanel>
  )
}
