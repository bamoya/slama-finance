import * as Menu from '@radix-ui/react-dropdown-menu'
import type { ComponentProps } from 'react'

import { useUiLanguage } from '../../lib/i18n'
import { cn } from '../../lib/utils'

export const DropdownMenu = Menu.Root
export const DropdownMenuTrigger = Menu.Trigger
export const DropdownMenuGroup = Menu.Group

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof Menu.Content>) {
  useUiLanguage()

  return (
    <Menu.Portal>
      <Menu.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-48 max-w-[calc(100vw-2rem)] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 text-[var(--text)] shadow-lg',
          className,
        )}
        {...props}
      />
    </Menu.Portal>
  )
}

export function DropdownMenuItem({
  className,
  variant = 'default',
  ...props
}: ComponentProps<typeof Menu.Item> & { variant?: 'default' | 'destructive' }) {
  useUiLanguage()

  return (
    <Menu.Item
      data-variant={variant}
      className={cn(
        'relative flex min-h-10 cursor-default select-none items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none focus:bg-[var(--surface-hover)] data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
        variant === 'destructive' && 'text-[var(--error-text)] focus:bg-[var(--error-bg)]',
        className,
      )}
      {...props}
    />
  )
}
