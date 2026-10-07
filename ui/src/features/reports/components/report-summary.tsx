import { useTranslation } from 'react-i18next'

import type {
  ReportAnalysis,
  ReportSection,
  ReportSectionKey,
} from '../../../api/generated/schemas/reporting/reporting.schemas'
import { type StatItem, StatsGrid } from '../../../components/management/stats-grid'

type Metric = ReportSection['metrics'][number]
const dashboardMetrics = [
  ['summary', 'invoiced_gross', 'invoiced', 'period'],
  ['summary', 'collections', 'collected', 'period'],
  ['summary', 'outstanding', 'outstanding', 'capture'],
  ['overdue', 'amount', 'overdue', 'capture'],
  ['pending_cheques', 'amount', 'pending', 'capture'],
] as const

/** Presentation of existing aggregates only; never sum currencies or paginated rows. */
export function ReportSummary({
  data,
  previous,
  dashboard = false,
}: {
  data: ReportAnalysis
  previous?: ReportAnalysis
  dashboard?: boolean
}) {
  const { t, i18n } = useTranslation('reportVisuals')
  const locale = i18n.resolvedLanguage ?? 'en'
  const money = (value: number, currency: string) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value)
  const number = (value: number, fraction = 0) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: fraction }).format(value)
  const currencies = data.currencies.length ? data.currencies : [data.filters.currency ?? 'MAD']
  const products = data.sections.find((section) => section.key === 'sales_by_product')
  const metricValue = (section: ReportSection | undefined, key: string, currency: string) =>
    Number(
      section?.metrics.find((metric) => metric.key === key && metric.currency === currency)
        ?.value ?? 0,
    )
  const comparison = (section: ReportSectionKey, metric: Metric) => {
    if (!previous || metric.timeBasis !== 'period')
      return t(metric.timeBasis === 'capture' ? 'captureBasis' : 'periodBasis')
    const baseline = metricValue(
      previous.sections.find((s) => s.key === section),
      metric.key,
      metric.currency ?? '',
    )
    return t('comparison', {
      change: baseline
        ? `${(((Number(metric.value) - baseline) / baseline) * 100).toFixed(1)}%`
        : t('noBaseline'),
      from: previous.filters.from,
      to: previous.filters.to,
    })
  }

  const groups = currencies
    .map((currency) => {
      let items: StatItem[]
      if (dashboard) {
        items = dashboardMetrics.flatMap(([sectionKey, key, label, basis]) => {
          const section = data.sections.find((s) => s.key === sectionKey)
          if (!section) return []
          const metric: Metric = section.metrics.find(
            (m) => m.key === key && m.currency === currency,
          ) ?? { key, currency, value: '0', unit: 'money', timeBasis: basis }
          return [
            {
              label: t(label),
              value: money(Number(metric.value), currency),
              detail: comparison(sectionKey, metric),
            },
          ]
        })
      } else if (products) {
        const quantity = metricValue(products, 'quantity', currency)
        const net = metricValue(products, 'net', currency)
        items = [
          { label: t('net'), value: money(net, currency), detail: t('periodBasis') },
          { label: t('quantity'), value: number(quantity), detail: t('unitsHint') },
          {
            label: t('averageUnitPrice'),
            value: quantity > 0 ? money(net / quantity, currency) : '—',
            detail: t('averageUnitPriceHint'),
          },
        ]
      } else {
        items = data.sections
          .filter(
            (s) =>
              ['summary', 'overdue', 'pending_cheques'].includes(s.key) ||
              (!data.sections.some((section) => section.key === 'summary') &&
                ['revenue', 'collections', 'outstanding'].includes(s.key)),
          )
          .flatMap((section) =>
            section.metrics
              .filter(
                (m) =>
                  m.currency === currency &&
                  (section.key === 'summary'
                    ? ['invoiced_gross', 'collections', 'outstanding'].includes(m.key)
                    : m.key === (section.key === 'revenue' ? 'gross' : 'amount')),
              )
              .map((metric) => ({
                label: t(
                  section.key === 'summary'
                    ? ({
                        invoiced_gross: 'invoiced',
                        collections: 'collected',
                        outstanding: 'outstanding',
                      }[metric.key] ?? metric.key)
                    : section.key === 'pending_cheques'
                      ? 'pending'
                      : section.key === 'revenue'
                        ? 'invoiced'
                        : section.key === 'collections'
                          ? 'collected'
                          : section.key,
                ),
                value: money(Number(metric.value), currency),
                detail: comparison(section.key, metric),
              })),
          )
      }
      return { currency, items }
    })
    .filter((group) => group.items.length)

  if (!groups.length) return null
  return (
    <div data-slot="report-summary" className="grid gap-content">
      {groups.map(({ currency, items }) => (
        <div key={currency} className="grid gap-2">
          {groups.length > 1 && <h3 className="text-sm font-semibold">{currency}</h3>}
          <StatsGrid items={items} maxColumns={dashboard ? 5 : 3} />
          {!dashboard && products && metricValue(products, 'weightKg', currency) > 0 && (
            <p className="text-xs text-muted-foreground">
              {t('knownWeight', { weight: number(metricValue(products, 'weightKg', currency), 3) })}
            </p>
          )}
          {!dashboard &&
            products &&
            metricValue(products, 'unknown_weight_count', currency) > 0 && (
              <p className="text-xs text-muted-foreground">
                {t('unknownWeight', {
                  count: metricValue(products, 'unknown_weight_count', currency),
                })}
              </p>
            )}
        </div>
      ))}
    </div>
  )
}
