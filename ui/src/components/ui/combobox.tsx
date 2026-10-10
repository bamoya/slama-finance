import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox'
import { Check, ChevronsUpDown } from 'lucide-react'
import { type ButtonHTMLAttributes, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { registerTranslations, useUiLanguage } from '../../lib/i18n'
import { cn } from '../../lib/utils'
import { Button } from './button'
import { formControlStyles } from './form-control-styles'

registerTranslations('combobox', {
  choose: 'Select a record',
  search: 'Search…',
  empty: 'No matching records.',
  loading: 'Loading…',
  error: 'Could not load records.',
  retry: 'Retry',
  selected: 'Selected record',
  searchLabel: 'Search options',
})

export type ComboboxOption = {
  value: string
  label: string
  keywords?: string[]
  disabled?: boolean
}

type Props = Pick<
  ButtonHTMLAttributes<HTMLButtonElement>,
  | 'id'
  | 'aria-label'
  | 'aria-labelledby'
  | 'aria-describedby'
  | 'aria-invalid'
  | 'disabled'
  | 'className'
> & {
  value: string
  onValueChange: (value: string) => void
  options: readonly ComboboxOption[]
  placeholder?: string
  search?: string
  onSearchChange?: (search: string) => void
  selectedLabel?: string
  clearLabel?: string
  loading?: boolean
  error?: boolean
  onRetry?: () => void
  name?: string
  required?: boolean
}

/** shadcn Combobox's input-inside-popup composition, backed by Base UI.
 * Remote callers own the results; local callers get label/keyword filtering.
 */
export function Combobox({
  value,
  onValueChange,
  options,
  placeholder,
  search,
  onSearchChange,
  selectedLabel,
  clearLabel,
  loading = false,
  error = false,
  onRetry,
  name,
  required,
  disabled,
  className,
  ...triggerProps
}: Props) {
  useUiLanguage()

  const { t } = useTranslation('combobox')
  const [localSearch, setLocalSearch] = useState('')
  const [remembered, setRemembered] = useState<ComboboxOption | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null)
  const { contains } = ComboboxPrimitive.useFilter({ sensitivity: 'base' })
  const selected =
    options.find((option) => option.value === value) ??
    (value && selectedLabel ? { value, label: selectedLabel } : null) ??
    (remembered?.value === value ? remembered : null) ??
    (value ? { value, label: t('selected') } : null)
  const items =
    loading || error
      ? []
      : [
          ...(clearLabel ? [{ value: '', label: clearLabel }] : []),
          ...options.filter((option) => !clearLabel || option.value !== ''),
        ]
  const setSearch = (next: string) => {
    setLocalSearch(next)
    onSearchChange?.(next)
  }
  return (
    <ComboboxPrimitive.Root<ComboboxOption>
      items={items}
      value={selected}
      disabled={disabled}
      name={name}
      required={required}
      inputValue={search ?? localSearch}
      onInputValueChange={setSearch}
      onOpenChange={(open) => {
        // Keep nested popups within the Radix modal's focus/pointer boundary.
        // Body-portaled popups can sit behind a Sheet or be treated as outside it.
        if (open)
          setPortalContainer(trigger.current?.closest<HTMLElement>('[role="dialog"]') ?? null)
        if (!open) setSearch('')
      }}
      itemToStringLabel={(item) => item.label}
      isItemEqualToValue={(item, current) => item.value === current.value}
      filter={
        onSearchChange
          ? null
          : (item, query) =>
              item.value === '' || contains([item.label, ...(item.keywords ?? [])].join(' '), query)
      }
      onValueChange={(item) => {
        setRemembered(item)
        onValueChange(item?.value ?? '')
      }}
    >
      <ComboboxPrimitive.Trigger
        ref={trigger}
        {...triggerProps}
        className={cn(
          formControlStyles,
          'ui-action flex h-control w-full min-w-0 items-center justify-between gap-2 overflow-hidden px-3 text-left [&_svg]:size-4 [&_svg]:shrink-0',
          className,
        )}
      >
        <span className="min-w-0 flex-1 truncate">
          {value ? selected?.label : (clearLabel ?? placeholder ?? t('choose'))}
        </span>
        <ChevronsUpDown aria-hidden="true" />
      </ComboboxPrimitive.Trigger>
      <ComboboxPrimitive.Portal container={portalContainer ?? undefined}>
        <ComboboxPrimitive.Positioner sideOffset={6} align="start" className="isolate z-[100]">
          <ComboboxPrimitive.Popup
            aria-label={triggerProps['aria-label'] ?? placeholder ?? t('choose')}
            className="w-[var(--anchor-width)] max-w-[var(--available-width)] overflow-hidden rounded-control border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-lg"
          >
            <ComboboxPrimitive.Input
              aria-label={t('searchLabel')}
              placeholder={t('search')}
              className="h-control w-full min-w-0 border-0 border-b border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)]"
            />
            {loading && (
              <ComboboxPrimitive.Status className="p-4 text-sm text-[var(--muted)]">
                {t('loading')}
              </ComboboxPrimitive.Status>
            )}
            {error && (
              <div role="alert" className="grid gap-2 p-4 text-sm text-[var(--error-text)]">
                {t('error')}
                {onRetry && (
                  <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                    {t('retry')}
                  </Button>
                )}
              </div>
            )}
            {!loading && !error && (
              <ComboboxPrimitive.Empty className="p-4 text-sm text-[var(--muted)] empty:hidden">
                {t('empty')}
              </ComboboxPrimitive.Empty>
            )}
            <ComboboxPrimitive.List className="max-h-[min(300px,calc(var(--available-height)-48px))] overflow-y-auto overscroll-contain p-1 outline-none empty:p-0">
              {(item: ComboboxOption) => (
                <ComboboxPrimitive.Item
                  key={item.value}
                  value={item}
                  data-value={item.value}
                  disabled={item.disabled}
                  className="relative flex min-h-10 cursor-default items-center gap-2 rounded-lg py-2 pl-8 pr-3 text-sm outline-none select-none data-highlighted:bg-[var(--accent-soft)] data-highlighted:text-[var(--accent)] data-disabled:pointer-events-none data-disabled:opacity-50"
                >
                  <ComboboxPrimitive.ItemIndicator className="absolute left-2 [&_svg]:size-4">
                    <Check aria-hidden="true" />
                  </ComboboxPrimitive.ItemIndicator>
                  <span className="min-w-0 break-words">{item.label}</span>
                </ComboboxPrimitive.Item>
              )}
            </ComboboxPrimitive.List>
          </ComboboxPrimitive.Popup>
        </ComboboxPrimitive.Positioner>
      </ComboboxPrimitive.Portal>
    </ComboboxPrimitive.Root>
  )
}
