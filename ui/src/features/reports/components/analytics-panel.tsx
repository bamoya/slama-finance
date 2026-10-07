import type { ReactNode } from 'react'

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card'
import { useUiLanguage } from '../../../lib/i18n'

export function AnalyticsPanel({
  title,
  description,
  children,
  footer,
  className = '',
}: {
  title: string
  description: string
  children: ReactNode
  footer?: ReactNode
  className?: string
}) {
  useUiLanguage()

  return (
    <Card className={`min-w-0 rounded-2xl shadow-none ${className}`}>
      <CardHeader className="px-4 sm:px-panel">
        <CardTitle role="heading" aria-level={3} className="text-base leading-snug">
          {title}
        </CardTitle>
        <CardDescription className="text-xs leading-relaxed">{description}</CardDescription>
      </CardHeader>
      <CardContent className="min-w-0 flex-1 px-4 sm:px-panel">{children}</CardContent>
      {footer && (
        <CardFooter className="border-t px-4 text-xs leading-relaxed text-muted-foreground sm:px-panel">
          {footer}
        </CardFooter>
      )}
    </Card>
  )
}
