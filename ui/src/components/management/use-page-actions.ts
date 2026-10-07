import { createContext, useContext } from 'react'

export const PageActionsContext = createContext<{
  target: HTMLDivElement | null
  setTarget: (target: HTMLDivElement | null) => void
} | null>(null)

export function usePageActions() {
  return useContext(PageActionsContext)
}
