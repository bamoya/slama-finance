import { translate, useUiLanguage } from '../../../../lib/i18n'

export function UsageMeter({
  label,
  used,
  limit,
  unit = '',
}: {
  label: string
  used: number
  limit: number
  unit?: string
}) {
  const language = useUiLanguage()
  const percentage = limit > 0 ? Math.min(100, (used / limit) * 100) : used > 0 ? 100 : 0
  const warning = limit > 0 && used >= limit * 0.8
  const format = (n: number) =>
    new Intl.NumberFormat(language === 'fr' ? 'fr-MA' : 'en-GB', {
      maximumFractionDigits: unit === 'GB' ? 2 : 0,
    }).format(n)
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span>{label}</span>
        <strong className="tabular-nums">
          {format(used)} / {format(limit)} {unit}
        </strong>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={Math.max(limit, used, 1)}
        aria-valuenow={used}
        className="h-2 overflow-hidden rounded-full bg-[var(--surface-muted)]"
      >
        <div
          className={
            warning
              ? 'h-full rounded-full bg-[var(--warning-text)]'
              : 'h-full rounded-full bg-[var(--accent)]'
          }
          style={{ width: `${percentage}%` }}
        />
      </div>
      {warning && (
        <p className="text-xs text-[var(--muted)]">
          {translate(used >= limit ? 'Allowance reached' : 'Approaching your allowance')}
        </p>
      )}
    </div>
  )
}
