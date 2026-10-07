import { cn } from 'cn'
import { CheckIcon } from 'lucide-react'
import { Checkbox as CheckboxPrimitive } from 'radix-ui'
import * as React from 'react'

import { useUiLanguage } from '../../lib/i18n'

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  useUiLanguage()

  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'ui-action peer size-4 shrink-0 rounded-[4px] border border-[var(--field-border)] bg-[var(--field-bg)] transition-shadow outline-none focus-visible:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-[var(--error-border)] aria-invalid:focus-visible:ring-[var(--error-bg)] data-[state=checked]:border-[var(--accent)] data-[state=checked]:bg-[var(--accent)] data-[state=checked]:text-[var(--brand-foreground)]',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
