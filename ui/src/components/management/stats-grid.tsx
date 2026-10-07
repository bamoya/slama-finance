import type { ReactNode } from 'react'

import { useUiLanguage } from '../../lib/i18n'
import { cn } from '../../lib/utils'

export type StatItem = { label: string; value: ReactNode; detail?: string }

const columns = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2 xl:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
}

/** Fit the available metrics instead of reserving empty desktop columns. */
export function StatsGrid({
  items,
  compact = false,
  maxColumns = 4,
}: {
  items: StatItem[]
  compact?: boolean
  maxColumns?: 2 | 3 | 4 | 5
}) {
  useUiLanguage()
  if (!items.length) return null
  const count = Math.min(items.length, compact ? 2 : maxColumns) as keyof typeof columns

  return (
    <dl data-slot="stats-grid" className={cn('grid gap-3', columns[count])}>
      {items.map((item) => (
        <div
          key={item.label}
          className="min-w-0 rounded-2xl border border-border bg-[var(--surface)] p-3 lg:rounded-panel lg:p-5"
        >
          <dt className="text-xs text-muted-foreground lg:text-sm">{item.label}</dt>
          <dd
            data-slot="stat-value"
            className="mt-2 break-words text-lg font-bold tabular-nums text-[var(--text)] lg:text-2xl"
          >
            {item.value}
          </dd>
          {item.detail && <dd className="mt-2 text-xs text-muted-foreground">{item.detail}</dd>}
        </div>
      ))}
    </dl>
  )
}
