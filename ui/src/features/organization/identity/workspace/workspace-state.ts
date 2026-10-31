import { createContext, useContext } from 'react'

import type { WorkspaceSession } from '../../../../api/generated/schemas/identity/workspace.schemas'
export const WorkspaceContext = createContext<WorkspaceSession | null>(null)
export const useWorkspace = () => useContext(WorkspaceContext)
