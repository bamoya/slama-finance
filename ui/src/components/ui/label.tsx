import type { LabelHTMLAttributes } from 'react'

import { useUiLanguage } from '../../lib/i18n'
import { cn } from '../../lib/utils'
export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  useUiLanguage()

  return <label className={cn('text-sm font-medium text-[var(--text)]', className)} {...props} />
}
