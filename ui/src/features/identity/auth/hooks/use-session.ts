import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'wouter'

import { getGetSessionQueryKey } from '../../../../api/generated/identity/identity'
import type { Session } from '../../../../api/generated/schemas/identity/auth.schemas'
import { getSession } from '../api/auth-client'
import { publishSessionMessage, rememberSessionExpiry } from '../session-sync'
export const sessionKey = getGetSessionQueryKey()
export function useSession() {
  const client = useQueryClient()
  return useQuery({
    queryKey: sessionKey,
    queryFn: async ({ signal }) => {
      const previous = client.getQueryData<Session | null>(sessionKey)
      const session = await getSession(signal)
      if (!session && previous) {
        client.removeQueries({ predicate: (query) => query.queryKey[0] !== sessionKey[0] })
      }
      if (!session && previous?.idleExpiresAt && Date.parse(previous.idleExpiresAt) <= Date.now()) {
        rememberSessionExpiry()
        publishSessionMessage({ userId: previous.user.id, type: 'inactivity' })
      }
      return session
    },
    staleTime: 0,
    retry: false,
    refetchInterval: 60_000,
    refetchOnWindowFocus: 'always',
  })
}
export function useAuthTransition() {
  const client = useQueryClient()
  const [, navigate] = useLocation()
  return async (session: Session | null) => {
    await client.cancelQueries()
    client.clear()
    client.setQueryData(sessionKey, session)
    navigate(
      session ? (session.purpose === 'password_change' ? '/set-password' : '/dashboard') : '/login',
      { replace: true },
    )
  }
}
