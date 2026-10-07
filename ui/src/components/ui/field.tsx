import type { ComponentProps } from 'react'

import { useUiLanguage } from '../../lib/i18n'
import { cn } from '../../lib/utils'
import { Label } from './label'

// shadcn Field composition, using the project's semantic theme tokens.
export function FieldGroup({ className, ...props }: ComponentProps<'div'>) {
  useUiLanguage()

  return (
    <div
      data-slot="field-group"
      className={cn('flex w-full flex-col gap-section', className)}
      {...props}
    />
  )
}

export function Field({ className, ...props }: ComponentProps<'div'>) {
  useUiLanguage()

  return (
    <div
      role="group"
      data-slot="field"
      className={cn(
        'group/field flex w-full flex-col gap-2 data-[invalid=true]:text-[var(--error-text)]',
        className,
      )}
      {...props}
    />
  )
}

export function FieldLabel({ className, ...props }: ComponentProps<typeof Label>) {
  useUiLanguage()

  return (
    <Label
      data-slot="field-label"
      className={cn('group-data-[disabled=true]/field:opacity-50', className)}
      {...props}
    />
  )
}

export function FieldError({ className, ...props }: ComponentProps<'div'>) {
  useUiLanguage()

  return (
    <div
      role="alert"
      data-slot="field-error"
      className={cn('text-sm text-[var(--error-text)]', className)}
      {...props}
    />
  )
}
