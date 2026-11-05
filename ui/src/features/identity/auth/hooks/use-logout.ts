import { useQueryClient } from '@tanstack/react-query'

import { useLogout as useGeneratedLogout } from '../../../../api/generated/identity/identity'
import { logout, type Session } from '../api/auth-client'
import { publishSessionMessage } from '../session-sync'
import { sessionKey, useAuthTransition } from './use-session'

export function useLogout() {
  const transition = useAuthTransition()
  const client = useQueryClient()
  return useGeneratedLogout({
    mutation: {
      mutationFn: logout,
      onSuccess: () => {
        const session = client.getQueryData<Session | null>(sessionKey)
        if (session) publishSessionMessage({ userId: session.user.id, type: 'logout' })
        return transition(null)
      },
    },
  })
}
