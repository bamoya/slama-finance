import { createContext, type ReactNode, useContext } from 'react'

export type MoreActionOptions = {
  label: string
  icon?: ReactNode
  disabled?: boolean
  destructive?: boolean
  href?: string
  onSelect?: () => void
}

export const MoreActionsContext = createContext<{
  register: (id: string, getOptions: () => MoreActionOptions) => () => void
  restoreFocus: () => void
} | null>(null)

export const useMoreActionsContext = () => useContext(MoreActionsContext)
