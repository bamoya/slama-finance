import { translate } from '../../../../../lib/i18n'

/** Before and after snapshots of an audited change, side by side. */
export function AuditChangeDiff({ before, after }: { before: unknown; after: unknown }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {(
        [
          ['Before', before],
          ['After', after],
        ] as const
      ).map(([label, value]) => (
        <div key={label} className="min-w-0">
          <h3 className="mb-1 text-xs font-semibold uppercase text-[var(--muted)]">
            {translate(label)}
          </h3>
          <pre className="max-h-64 overflow-auto rounded-lg bg-[var(--accent-soft)] p-3 text-xs">
            {value === null ? '—' : JSON.stringify(value, null, 2)}
          </pre>
        </div>
      ))}
    </div>
  )
}
