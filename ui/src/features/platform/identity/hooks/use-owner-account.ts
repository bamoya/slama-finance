import { createContext, useContext } from 'react'

import type { OwnerSession } from '../../../../api/generated/models'

export const OwnerAccountContext = createContext<OwnerSession['owner'] | null>(null)
export function useOwnerAccount() {
  const owner = useContext(OwnerAccountContext)
  if (!owner) throw new Error('Owner account context requires OwnerPortalLayout')
  return owner
}
