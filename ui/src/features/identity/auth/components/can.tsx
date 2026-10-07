import type { ReactNode } from 'react'

import { useUiLanguage } from '../../../../lib/i18n'
import { useAuthorization } from '../hooks/use-authorization'
export function Can({
  permission,
  children,
  fallback = null,
}: {
  permission: string | readonly string[]
  children: ReactNode
  fallback?: ReactNode
}) {
  useUiLanguage()

  const { can, canAll } = useAuthorization()
  return (typeof permission === 'string' ? can(permission) : canAll(permission))
    ? children
    : fallback
}
