import type { ReactNode } from 'react'
import { Link } from 'wouter'

export function DocumentClientLink({
  clientId,
  children,
  className,
}: {
  clientId: string | null
  children: ReactNode
  className?: string
}) {
  return clientId ? (
    <Link href={`/clients/${clientId}`} className={className}>
      {children}
    </Link>
  ) : (
    <span>{children}</span>
  )
}
