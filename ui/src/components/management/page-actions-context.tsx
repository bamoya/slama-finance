import { type ReactNode, useMemo, useState } from 'react'

import { useUiLanguage } from '../../lib/i18n'
import { PageActionsContext } from './use-page-actions'

/** One action destination per routed page; form state stays with its owning component. */
export function PageActionsProvider({ children }: { children: ReactNode }) {
  useUiLanguage()

  const [target, setTarget] = useState<HTMLDivElement | null>(null)
  const value = useMemo(() => ({ target, setTarget }), [target])
  return <PageActionsContext.Provider value={value}>{children}</PageActionsContext.Provider>
}
