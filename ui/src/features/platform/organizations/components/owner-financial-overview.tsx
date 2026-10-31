import { ChartNoAxesCombined, Clock3, Info, ReceiptText, TrendingUp, Wallet } from 'lucide-react'
import { CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts'

import type { GetOwnerFinancialSummary200 as FinanceData } from '../../../../api/generated/models'
import { Button } from '../../../../components/ui/button'
import { Card } from '../../../../components/ui/card'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '../../../../components/ui/chart'
import { Tooltip } from '../../../../components/ui/tooltip'
import { displayDate } from '../../../../lib/dates'
import { translate, useUiLanguage } from '../../../../lib/i18n'

const metrics = [
  {
    label: 'Revenue',
    icon: TrendingUp,
    note: 'Invoiced in the period',
    help: 'Revenue is invoiced sales, not profit. Expenses are not tracked.',
  },
  {
    label: 'Collected',
    icon: Wallet,
    note: 'Payments in the period',
    help: 'Payments recorded during the selected period.',
  },
  {
    label: 'Outstanding',
    icon: Clock3,
    note: 'Current unpaid balance',
    help: 'Current outstanding balance, independent of the reporting period.',
  },
  {
    label: 'Of which overdue',
    icon: ReceiptText,
    note: 'Included in outstanding',
    help: 'Overdue balances are already included in outstanding.',
  },
]
export function OwnerFinancialSummary({ data }: { data?: FinanceData }) {
  const language = useUiLanguage()
  const values = data
    ? [data.totals.revenue, data.totals.collected, data.totals.outstanding, data.totals.overdue]
    : null
  const format = (value: string) =>
    new Intl.NumberFormat(language === 'fr' ? 'fr-MA' : 'en-GB', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(Number(value))
  return (
    <section className="owner-metrics" aria-label={translate('Financial summary')}>
      {metrics.map(({ label, icon: Icon, note, help }, index) => (
        <Card className="owner-metric owner-card" key={label}>
          <div className="owner-metric-label">
            <span>{translate(label)}</span>
            <Tooltip label={translate(help)}>
              <Button
                variant="ghost"
                size="icon-md"
                type="button"
                className="owner-info-button"
                aria-label={translate(help)}
              >
                <Icon size={16} />
              </Button>
            </Tooltip>
          </div>
          <div className="owner-metric-value">
            {values ? (
              <span>{format(values[index]!)}</span>
            ) : (
              <span aria-label={translate('Data unavailable')}>—</span>
            )}
            <small>MAD</small>
          </div>
          <p>{translate(note)}</p>
        </Card>
      ))}
    </section>
  )
}
export function OwnerFinancialOverview({ data }: { data?: FinanceData }) {
  useUiLanguage()
  return (
    <Card
      className="owner-card owner-financial-chart"
      role="region"
      aria-labelledby="owner-finance-title"
    >
      <div className="owner-section-heading">
        <div>
          <span className="owner-eyebrow">{translate('FINANCIAL OVERVIEW')}</span>
          <h2 id="owner-finance-title">{translate('Invoiced revenue and collections')}</h2>
          <p>{translate('Compare sales and payments across your organizations.')}</p>
        </div>
        <span className="owner-currency">MAD</span>
      </div>
      {data ? (
        <ChartContainer
          className="h-72 w-full"
          config={{
            revenue: { label: translate('Revenue'), color: 'var(--accent)' },
            collected: { label: translate('Collected'), color: 'var(--chart-2)' },
          }}
        >
          <ComposedChart
            accessibilityLayer
            data={data.series.map((point) => ({
              ...point,
              revenue: Number(point.revenue),
              collected: Number(point.collected),
            }))}
            margin={{ top: 16, right: 16, bottom: 8, left: 8 }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(date) => displayDate(String(date))}
              minTickGap={40}
            />
            <YAxis width={65} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Line
              type="monotone"
              dataKey="revenue"
              stroke="var(--color-revenue)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="collected"
              stroke="var(--color-collected)"
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={false}
            />
          </ComposedChart>
        </ChartContainer>
      ) : (
        <div className="owner-finance-empty">
          <span className="owner-empty-icon">
            <ChartNoAxesCombined size={28} />
          </span>
          <strong>{translate('Consolidated finances are not available yet.')}</strong>
          <p>
            {translate(
              'Your organizations are connected. Financial totals and trends will appear here when consolidation is available.',
            )}
          </p>
        </div>
      )}
      <div className="owner-finance-note">
        <Info size={14} />
        <span>
          {translate(
            data
              ? 'Financial summaries are read-only. Log in separately to manage organization records.'
              : 'Unavailable figures are shown as a dash, never as a zero balance.',
          )}
        </span>
      </div>
    </Card>
  )
}
