import { Popover } from '@base-ui/react/popover'
import { CalendarDays } from 'lucide-react'
import { useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { useTranslation } from 'react-i18next'

import { registerTranslations, useUiLanguage } from '../../lib/i18n'
import { Button } from './button'
import { Calendar } from './calendar'

registerTranslations('dateRange', {
  title: 'Date range',
  apply: 'Apply',
  clear: 'Clear dates',
  cancel: 'Cancel',
  hint: 'Select the first and last day. Both dates are included.',
  from: 'From {{date}}',
  until: 'Until {{date}}',
})

function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const [year, month, day] = value.split('-').map(Number)
  if (year === undefined || month === undefined || day === undefined) return undefined
  const date = new Date(year, month - 1, day, 12)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : undefined
}
const dateString = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export function DateRangePicker({
  from = '',
  to = '',
  onChange,
  label,
}: {
  from?: string
  to?: string
  onChange: (from: string, to: string) => void
  label?: string
}) {
  useUiLanguage()

  const { t, i18n: language } = useTranslation('dateRange')
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DateRange>()
  const start = parseDate(from),
    end = parseDate(to)
  const format = (date: Date) =>
    new Intl.DateTimeFormat(language.language, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date)
  const title = label ?? t('title')
  const display =
    start && end
      ? `${format(start)} – ${format(end)}`
      : start
        ? t('from', { date: format(start) })
        : end
          ? t('until', { date: format(end) })
          : title
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(start || end ? { from: start, to: end } : undefined)
        setOpen(next)
      }}
    >
      <Popover.Trigger
        render={<Button variant="field" className="w-full justify-start" />}
        aria-label={`${title}: ${display}`}
      >
        <CalendarDays size={16} aria-hidden="true" />
        <span className="truncate">{display}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="start" className="date-range-positioner">
          <Popover.Popup className="date-range-popup rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-[var(--text)] shadow-lg">
            <Popover.Title className="text-sm font-semibold">{title}</Popover.Title>
            <Popover.Description className="mb-3 mt-1 max-w-64 text-xs text-[var(--muted)]">
              {t('hint')}
            </Popover.Description>
            <Calendar
              mode="range"
              selected={draft}
              onSelect={setDraft}
              defaultMonth={start ?? end}
              autoFocus
            />
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onChange('', '')
                  setOpen(false)
                }}
              >
                {t('clear')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                {t('cancel')}
              </Button>
              <Button
                size="sm"
                disabled={!draft?.from || !draft?.to}
                onClick={() => {
                  if (draft?.from && draft.to) {
                    onChange(dateString(draft.from), dateString(draft.to))
                    setOpen(false)
                  }
                }}
              >
                {t('apply')}
              </Button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
