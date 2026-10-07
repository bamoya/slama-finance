import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type {
  ReportAnalysis,
  ReportSectionKey,
} from '../../../api/generated/schemas/reporting/reporting.schemas'
import { Button } from '../../../components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../../../components/ui/collapsible'
import { translate, useUiLanguage } from '../../../lib/i18n'
import { VisualReport } from './visual-report'

/** Explicitly illustrative. Never imported by live routes or sent to the API. */
function sample(sections: ReportSectionKey[]): ReportAnalysis {
  return {
    snapshotVersion: 2,
    metricDefinitionVersion: '2',
    capturedAt: '2026-10-01T08:00:00Z',
    companyName: translate('Sample company'),
    currencies: ['MAD'],
    filters: {
      from: '2026-09-01',
      to: '2026-09-30',
      timezone: 'Africa/Casablanca',
      sections,
      bucket: 'day',
      limit: 25,
      offset: 0,
      sort: 'date_desc',
      start: '2026-09-01T00:00:00Z',
      endExclusive: '2026-10-01T00:00:00Z',
    },
    sections: sections.map((key) => {
      const timeBasis = ['outstanding', 'overdue', 'pending_cheques'].includes(key)
        ? ('capture' as const)
        : key === 'estimates'
          ? ('lifecycle' as const)
          : ('period' as const)
      const group =
        key === 'outstanding' || key === 'overdue'
          ? 'aging'
          : key === 'payment_methods'
            ? 'methods'
            : key === 'estimates'
              ? 'cohort'
              : key === 'deliveries'
                ? 'delivery_status'
                : 'ranking'
      const names =
        group === 'aging'
          ? ['current', '1_30', '31_60', '61_plus']
          : group === 'methods'
            ? ['bank_transfer', 'cash', 'cheque']
            : group === 'cohort'
              ? ['issued', 'accepted', 'invoiced']
              : group === 'delivery_status'
                ? ['prepared', 'delivered', 'acknowledged']
                : [translate('Sample A'), translate('Sample B'), translate('Sample C')]
      return {
        key,
        timeBasis,
        total: 12,
        limit: 25,
        offset: 0,
        coverage: null,
        rows: [],
        metrics: (key === 'summary'
          ? ['invoiced_gross', 'collections', 'outstanding']
          : key === 'vat'
            ? ['net', 'vat']
            : key === 'sales_by_product'
              ? ['net', 'quantity', 'weightKg']
              : key === 'revenue'
                ? ['gross', 'net', 'vat']
                : ['amount']
        ).map((metric, index) => ({
          key: metric,
          currency: 'MAD',
          value: String(
            metric === 'quantity'
              ? 250
              : metric === 'weightKg'
                ? 125
                : ([12500, 8500, 4000][index] ?? 12000),
          ),
          unit: metric === 'quantity' ? 'count' : metric === 'weightKg' ? 'kg' : 'money',
          timeBasis: metric === 'outstanding' ? 'capture' : timeBasis,
        })),
        series: ['revenue', 'collections'].includes(key)
          ? [1, 8, 15, 22, 29].map((day, index) => ({
              date: `2026-09-${String(day).padStart(2, '0')}`,
              currency: 'MAD',
              key: key === 'revenue' ? 'gross' : 'amount',
              value: String([2400, 3600, 1800, 3200, 1500][index]),
            }))
          : [],
        visuals: ['revenue', 'collections', 'summary', 'vat', 'pending_cheques'].includes(key)
          ? []
          : names.map((name, index) => ({
              group,
              key: name,
              label: name,
              currency: key === 'deliveries' ? null : 'MAD',
              value: String(
                group === 'cohort' || group === 'delivery_status'
                  ? [12, 8, 5][index]
                  : [4800, 3200, 1500, 700][index],
              ),
              unit: group === 'cohort' || group === 'delivery_status' ? 'count' : 'money',
            })),
      }
    }),
  }
}
export function ScheduleVisualPreview({ sections }: { sections: ReportSectionKey[] }) {
  useUiLanguage()

  const { t } = useTranslation('reportVisuals')
  const [open, setOpen] = useState(false)
  return (
    <aside className="min-w-0 rounded-panel border border-border bg-card p-4 md:p-panel">
      <h2 className="text-lg font-semibold">{t('preview')}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t('sample')}</p>
      <p className="mt-2 text-xs text-muted-foreground">{t('sampleHint')}</p>
      <p className="my-4 rounded-xl border border-border bg-muted p-3 text-xs">
        {t('attachmentWarning')}
      </p>
      <div className="hidden lg:block">
        <VisualReport data={sample(sections)} frozen />
      </div>
      <Collapsible open={open} onOpenChange={setOpen} className="lg:hidden">
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm">
            {t('preview')}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4">
          <VisualReport data={sample(sections)} frozen />
        </CollapsibleContent>
      </Collapsible>
    </aside>
  )
}
