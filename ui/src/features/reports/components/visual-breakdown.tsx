import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Cell, Pie, PieChart, Treemap } from 'recharts'

import type { ReportSection } from '../../../api/generated/schemas/reporting/reporting.schemas'
import { Button } from '../../../components/ui/button'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '../../../components/ui/chart'
import { translate, useUiLanguage } from '../../../lib/i18n'
import { AnalyticsPanel } from './analytics-panel'
type ReportVisualPoint = NonNullable<ReportSection['visuals']>[number]

export function VisualBreakdown({
  title,
  description,
  points,
  ring = false,
  treemap = false,
  onSelect,
  footer,
}: {
  title: string
  description: string
  points: ReportVisualPoint[]
  ring?: boolean
  treemap?: boolean
  onSelect?: (point: ReportVisualPoint) => void
  footer?: ReactNode
}) {
  useUiLanguage()

  const { t, i18n } = useTranslation('reportVisuals')
  const order =
    points[0]?.group === 'cohort'
      ? ['issued', 'accepted', 'invoiced']
      : points[0]?.group === 'aging'
        ? ['current', '1_30', '31_60', '61_plus']
        : []
  const sorted = [...points].sort((a, b) =>
    order.length ? order.indexOf(a.key) - order.indexOf(b.key) : Number(b.value) - Number(a.value),
  )
  const entries = sorted.map((point, index) => ({
    ...point,
    value: Number(point.value),
    color: `var(--chart-${(index % 5) + 1})`,
    name: ['ranking', 'variants'].includes(point.group)
      ? point.key === 'other'
        ? t('other')
        : ['manual', 'uncategorized'].includes(point.key)
          ? translate(point.label)
          : point.label
      : t(point.key),
  }))
  const total =
    points[0]?.group === 'cohort'
      ? Number(points.find((p) => p.key === 'issued')?.value ?? 0)
      : entries.reduce((sum, point) => sum + point.value, 0)
  const max = Math.max(1, ...entries.map((point) => point.value))
  const format = (point: (typeof entries)[number]) =>
    new Intl.NumberFormat(
      i18n.resolvedLanguage ?? 'en',
      point.unit === 'money' && point.currency
        ? { style: 'currency', currency: point.currency }
        : { maximumFractionDigits: 2 },
    ).format(point.value)
  return (
    <AnalyticsPanel title={title} description={description} footer={footer}>
      {!entries.length || total === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <>
          {treemap && (
            <ChartContainer
              className="mb-4 h-64 w-full"
              config={{ value: { label: title, color: 'var(--chart-1)' } }}
            >
              <Treemap
                data={entries}
                dataKey="value"
                nameKey="name"
                aspectRatio={1.6}
                isAnimationActive={false}
                content={<CategoryTile />}
              />
            </ChartContainer>
          )}
          {ring && (
            <ChartContainer
              data-chart-kind="donut"
              className="mx-auto mb-4 aspect-square w-full max-w-64"
              config={Object.fromEntries(
                entries.map((point) => [point.key, { label: point.name, color: point.color }]),
              )}
            >
              <PieChart accessibilityLayer margin={{ top: 12, right: 12, bottom: 12, left: 12 }}>
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      hideLabel
                      nameKey="name"
                      formatter={(_value, _name, item) => (
                        <span>
                          {item.payload.name}: {format(item.payload)}
                        </span>
                      )}
                    />
                  }
                />
                <Pie
                  data={entries}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius="58%"
                  outerRadius="82%"
                  paddingAngle={2}
                  isAnimationActive={false}
                >
                  {entries.map((point) => (
                    <Cell key={point.key} fill={point.color} stroke="var(--surface)" />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
          )}
          <div className="grid gap-3" data-slot="chart-legend">
            {entries.map((point, index) => (
              <div key={point.key}>
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    {(ring || treemap) && (
                      <span
                        aria-hidden="true"
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: point.color }}
                      />
                    )}
                    {onSelect && point.key !== 'other' ? (
                      <Button variant="ghost" size="sm" onClick={() => onSelect(sorted[index]!)}>
                        {point.name}
                      </Button>
                    ) : (
                      <span className="min-w-0 truncate">{point.name}</span>
                    )}
                  </div>
                  <span className="shrink-0 text-xs tabular-nums">
                    {format(point)}{' '}
                    <span className="text-muted-foreground">
                      · {Math.round((point.value / total) * 100)}%
                    </span>
                  </span>
                </div>
                {!ring && !treemap && (
                  <div className="mt-2 h-3 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(point.value / max) * 100}%`, background: point.color }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </AnalyticsPanel>
  )
}

function CategoryTile(props: Record<string, unknown>) {
  useUiLanguage()

  const { x = 0, y = 0, width = 0, height = 0, name = '', color = 'var(--chart-1)', depth } = props
  if (depth !== 1) return null
  const w = Number(width),
    h = Number(height)
  return (
    <g>
      <rect
        x={Number(x) + 2}
        y={Number(y) + 2}
        width={Math.max(0, w - 4)}
        height={Math.max(0, h - 4)}
        rx={8}
        fill={String(color)}
        fillOpacity={0.22}
        stroke={String(color)}
      />
      {w > 65 && h > 28 && (
        <text x={Number(x) + 10} y={Number(y) + 22} fontSize={11} fill="var(--text)">
          {String(name).slice(0, Math.floor(w / 7) - 2)}
        </text>
      )}
    </g>
  )
}
