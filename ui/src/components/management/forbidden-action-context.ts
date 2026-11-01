import { createContext, type ReactNode, useContext } from 'react'

/** Lets the workspace layout offer a way out (first accessible page) on every access-denied state. */
export const ForbiddenActionContext = createContext<ReactNode>(null)
export const useForbiddenAction = () => useContext(ForbiddenActionContext)
