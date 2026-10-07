import { translate, useUiLanguage } from '../../lib/i18n'
import { cn } from '../../lib/utils'

const styles = {
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
  archived: 'bg-stone-100 text-stone-600 ring-stone-500/15',
  overdue: 'bg-rose-50 text-rose-700 ring-rose-600/15',
  draft: 'bg-amber-50 text-amber-700 ring-amber-600/15',
}
export function StatusBadge({
  label,
  tone = 'active',
}: {
  label: string
  tone?: keyof typeof styles
}) {
  useUiLanguage()

  return (
    <span
      data-status={tone}
      className={cn(
        'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
        styles[tone],
      )}
    >
      {translate(label)}
    </span>
  )
}
