import { Decimal } from 'decimal.js'

import type {
  ReportAnalysis,
  ReportSection,
} from '../../../../contracts/generated/reporting/reporting.schemas.js'

/** Presentation only: outstanding already contains the overdue aging buckets. */
export function exportVisuals(
  snapshot: ReportAnalysis,
  section: ReportSection,
): NonNullable<ReportSection['visuals']> {
  const visuals = section.visuals ?? []
  if (section.key !== 'overdue') return visuals
  const outstandingCurrencies = new Set(
    snapshot.sections
      .find((item) => item.key === 'outstanding')
      ?.visuals?.filter((point) => point.group === 'aging')
      .map((point) => point.currency) ?? [],
  )
  return visuals.filter(
    (point) => point.group !== 'aging' || !outstandingCurrencies.has(point.currency),
  )
}

/** Derived display figures match the UI; never calculate from paginated detail rows. */
export function exportMetrics(section: ReportSection): ReportSection['metrics'] {
  if (section.key !== 'sales_by_product') return section.metrics
  return [
    ...section.metrics,
    ...section.metrics
      .filter((metric) => metric.key === 'net')
      .flatMap((net) => {
        const quantity = section.metrics.find(
          (metric) => metric.key === 'quantity' && metric.currency === net.currency,
        )
        if (!quantity || new Decimal(quantity.value).lte(0)) return []
        return [
          {
            ...net,
            key: 'average_unit_price',
            value: new Decimal(net.value).div(quantity.value).toFixed(2),
          },
        ]
      }),
  ]
}

export function percentageChange(current: string, previous: string | undefined) {
  if (previous === undefined || new Decimal(previous).isZero()) return null
  return new Decimal(current).minus(previous).div(previous).times(100).toFixed(1)
}

export function exportContext(snapshot: ReportAnalysis): [string, string][] {
  const filters = snapshot.filters
  return [
    ['captured_at', snapshot.capturedAt],
    ['metric_definition_version', snapshot.metricDefinitionVersion],
    ['company', snapshot.companyName],
    ['timezone', filters.timezone],
    ['from', filters.from],
    ['to', filters.to],
    ['currency', filters.currency ?? 'all_separate'],
    ['client_id', filters.clientId ?? 'all'],
    ['product_id', filters.productId ?? 'all'],
    ['category_id', filters.categoryId ?? 'all'],
    ['sections', filters.sections.join(',')],
    ['bucket', filters.bucket],
    ['sort', filters.sort],
    ['detail_section', filters.detailSection ?? 'all_selected'],
    ['segment', filters.segment ?? 'all'],
    ['aggregate_scope', 'full_period_and_criteria_without_detail_segment'],
    ['detail_scope', filters.segment ? 'selected_segment' : 'full_period_and_criteria'],
    ['comparison_from', snapshot.comparison?.from ?? ''],
    ['comparison_to', snapshot.comparison?.to ?? ''],
    [
      'comparison_scope',
      'previous_period_aggregates_only; no_previous_detail_rows; no_capture_balance_comparison',
    ],
  ]
}
