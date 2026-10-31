import { ArrowRight, type LucideIcon } from 'lucide-react'
import { Link } from 'wouter'

import { Card } from '../../../../../components/ui/card'
import { translate } from '../../../../../lib/i18n'
import { cn } from '../../../../../lib/utils'

/** One headline number linking to the list that explains it. */
export function OverviewCard({
  label,
  hint,
  value,
  href,
  icon: Icon,
  emphasized = false,
}: {
  label: string
  hint: string
  value: number
  href: string
  icon: LucideIcon
  /** Draws attention to work waiting for an administrator. */
  emphasized?: boolean
}) {
  return (
    <Link
      href={href}
      className="group block rounded-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
    >
      <Card
        className={cn(
          'h-full gap-0 rounded-[14px] p-5 transition-colors group-hover:bg-[var(--surface-hover)]',
          emphasized && 'border-[var(--accent)]',
        )}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="rounded-xl bg-[var(--accent-soft)] p-2.5 text-[var(--accent)]">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <ArrowRight
            className="size-4 text-[var(--muted)] transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </div>
        <p className="text-xs text-[var(--muted)]">{translate(label)}</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-[var(--text)]">
          {value}
        </p>
        <p className="mt-2 text-xs text-[var(--muted)]">{translate(hint)}</p>
      </Card>
    </Link>
  )
}
