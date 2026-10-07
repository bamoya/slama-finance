import { useUiLanguage } from '../../lib/i18n'
// Adapted from shadcn/ui new-york registry (MIT): https://ui.shadcn.com/r/styles/new-york/skeleton.json
import { cn } from '../../lib/utils'

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  useUiLanguage()

  return <div className={cn('animate-pulse rounded-md bg-primary/10', className)} {...props} />
}

export { Skeleton }
