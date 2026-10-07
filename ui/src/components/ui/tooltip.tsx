import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import {
  type ComponentPropsWithoutRef,
  type ElementRef,
  forwardRef,
  type ReactNode,
  useState,
} from 'react'

import { useUiLanguage } from '../../lib/i18n'
import { cn } from '../../lib/utils'

export const TooltipRoot = TooltipPrimitive.Root
export const TooltipProvider = TooltipPrimitive.Provider
export const TooltipTrigger = TooltipPrimitive.Trigger
export const TooltipContent = forwardRef<
  ElementRef<typeof TooltipPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-[110] rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text)] shadow-md',
        localStorage.getItem('slama-theme') === 'dark' && 'is-dark',
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = 'TooltipContent'

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  useUiLanguage()

  const [open, setOpen] = useState(false)
  return (
    <TooltipPrimitive.Provider delayDuration={250}>
      <TooltipPrimitive.Root open={open} onOpenChange={setOpen}>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            sideOffset={6}
            className={cn(
              'z-[110] rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-medium text-[var(--text)] shadow-md',
              localStorage.getItem('slama-theme') === 'dark' && 'is-dark',
            )}
          >
            {label}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}
