import { X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { ReportSectionKey } from '../../../api/generated/schemas/reporting/reporting.schemas'
import { Button } from '../../../components/ui/button'
import { Combobox } from '../../../components/ui/combobox'
import { useUiLanguage } from '../../../lib/i18n'
import { useReportRecipients } from '../api/queries'

export function RecipientPicker({
  sections,
  value,
  onChange,
}: {
  sections: ReportSectionKey[]
  value: string[]
  onChange: (value: string[]) => void
}) {
  useUiLanguage()

  const { t } = useTranslation('reports')
  const [search, setSearch] = useState(''),
    [labels, setLabels] = useState<Record<string, string>>({})
  const query = useReportRecipients(
    { sections, search: search || undefined, limit: 100 },
    sections.length > 0,
  )
  return (
    <div className="grid gap-3">
      <Combobox
        value=""
        aria-label={t('staff')}
        placeholder={t('staff')}
        options={
          query.data?.items
            .filter((row) => !value.includes(row.id))
            .map((row) => ({
              value: row.id,
              label: `${row.name} · ${row.email}${row.eligible ? '' : ` · ${t('eligibility', { reasons: row.reasons.join(', ') })}`}`,
              disabled: !row.eligible,
            })) ?? []
        }
        search={search}
        onSearchChange={setSearch}
        loading={sections.length > 0 && query.isPending}
        error={query.isError}
        onRetry={() => void query.refetch()}
        disabled={!sections.length}
        onValueChange={(id) => {
          const row = query.data?.items.find((row) => row.id === id)
          if (!row?.eligible) return
          setLabels((current) => ({ ...current, [id]: `${row.name} · ${row.email}` }))
          onChange([...value, id])
        }}
      />
      <ul className="grid gap-2">
        {value.map((id) => (
          <li
            key={id}
            className="flex items-center justify-between gap-3 rounded-xl bg-[var(--surface-muted)] p-3 text-sm"
          >
            <span className="min-w-0 break-words">
              {labels[id] ??
                query.data?.items.find((row) => row.id === id)?.name ??
                t('unavailableRecipient')}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-md"
              aria-label={t('removeRecipient')}
              onClick={() => onChange(value.filter((current) => current !== id))}
            >
              <X />
            </Button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">{t('recipientHint')}</p>
    </div>
  )
}
