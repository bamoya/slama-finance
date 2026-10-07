import { type ReactNode } from 'react'
import { Link } from 'wouter'

import { useUiLanguage } from '../../lib/i18n'
import { buttonVariants } from '../ui/button'
import { Tooltip } from '../ui/tooltip'

export function ActionLink({
  href,
  label,
  children,
}: {
  href: string
  label: string
  children: ReactNode
}) {
  useUiLanguage()

  return (
    <Tooltip label={label}>
      <Link
        href={href}
        aria-label={label}
        className={buttonVariants({ variant: 'outline', size: 'icon', className: 'shrink-0' })}
      >
        {children}
      </Link>
    </Tooltip>
  )
}
