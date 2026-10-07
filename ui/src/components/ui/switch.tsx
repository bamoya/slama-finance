import * as SwitchPrimitive from '@radix-ui/react-switch'
import { type ComponentPropsWithoutRef, type ElementRef, forwardRef } from 'react'

import { cn } from '../../lib/utils'

export const Switch = forwardRef<
  ElementRef<typeof SwitchPrimitive.Root>,
  ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-[var(--switch-track)] bg-[var(--switch-track)] p-0.5 align-middle transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-[var(--accent)] data-[state=checked]:bg-[var(--accent)] aria-invalid:border-[var(--error-border)] motion-reduce:transition-none',
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="pointer-events-none block h-4 w-4 rounded-full bg-[var(--switch-thumb)] shadow-sm transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0 motion-reduce:transition-none" />
  </SwitchPrimitive.Root>
))
Switch.displayName = 'Switch'
