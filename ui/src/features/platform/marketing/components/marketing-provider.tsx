import type { ReactNode } from 'react'

import { useTheme } from '../../../../lib/use-theme'
import { MarketingContext } from '../hooks/marketing-context'

export function MarketingProvider({ children }: { children: ReactNode }) {
  const { isDark, toggleTheme } = useTheme()
  return (
    <MarketingContext.Provider
      value={{
        dark: isDark,
        setDark: (value) => {
          if (value !== isDark) toggleTheme()
        },
      }}
    >
      {children}
    </MarketingContext.Provider>
  )
}
