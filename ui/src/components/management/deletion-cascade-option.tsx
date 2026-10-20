import { cn } from 'cn'
import { TriangleAlert } from 'lucide-react'
import { useId } from 'react'

import { translate } from '../../lib/i18n'
import { Checkbox } from '../ui/checkbox'

/** Explicit opt-in shared by single-record and bulk deletion dialogs. */
export function DeletionCascadeOption({
  checked,
  onCheckedChange,
  label,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label: string
}) {
  const id = useId()
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors focus-within:ring-2 focus-within:ring-[var(--error-border)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60',
        checked
          ? 'border-[var(--error-border)] bg-[var(--error-bg)]'
          : 'border-border bg-muted/30 hover:bg-muted/60',
      )}
    >
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        className="mt-0.5 data-[state=checked]:border-[var(--error-text)] data-[state=checked]:bg-[var(--error-text)] data-[state=checked]:text-background"
        aria-describedby={`${id}-hint`}
        aria-labelledby={`${id}-label`}
      />
      <span className="min-w-0 flex-1 space-y-1">
        <span id={`${id}-label`} className="block text-sm font-medium leading-snug">
          {label}
        </span>
        <span
          id={`${id}-hint`}
          className={cn(
            'block text-xs leading-relaxed',
            checked ? 'text-[var(--error-text)]' : 'text-muted-foreground',
          )}
        >
          {checked
            ? translate('Related records will also be permanently deleted.')
            : translate('Leave unchecked to preserve related records.')}
        </span>
      </span>
      <TriangleAlert
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-[var(--error-text)]"
      />
    </label>
  )
}
