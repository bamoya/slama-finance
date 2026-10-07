import * as React from 'react'

import { useUiLanguage } from '../../lib/i18n'
import { cn } from '../../lib/utils'

function Card({ className, ...props }: React.ComponentProps<'div'>) {
  useUiLanguage()

  return (
    <div
      data-slot="card"
      className={cn(
        'flex flex-col gap-section rounded-xl border border-border bg-card py-panel text-card-foreground shadow-sm',
        className,
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  useUiLanguage()

  return (
    <div
      data-slot="card-header"
      className={cn(
        '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-panel has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-panel',
        className,
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  useUiLanguage()

  return (
    <div
      data-slot="card-title"
      className={cn('leading-none font-semibold', className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  useUiLanguage()

  return (
    <div
      data-slot="card-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  useUiLanguage()

  return (
    <div
      data-slot="card-action"
      className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  useUiLanguage()

  return <div data-slot="card-content" className={cn('px-panel', className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  useUiLanguage()

  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center border-border px-panel [.border-t]:pt-panel', className)}
      {...props}
    />
  )
}

export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle }
