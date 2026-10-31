import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'wouter'

import { getGetSessionQueryKey } from '../../../../../api/generated/identity/identity'
import type { Session } from '../../../../../api/generated/schemas/identity/auth.schemas'
import { useWorkspace } from '../../workspace/workspace-state'
import { getSession } from '../api/auth-client'
export const sessionKey = getGetSessionQueryKey()
export function useSession() {
  const workspace = useWorkspace()
  const query = useQuery({
    enabled: !workspace,
    queryKey: sessionKey,
    queryFn: ({ signal }) => getSession(signal),
    staleTime: 0,
    retry: false,
    refetchInterval: 60_000,
    refetchOnWindowFocus: 'always',
  })
  return workspace
    ? {
        ...query,
        data: workspace.session,
        isPending: false,
        isError: false,
        isSuccess: true,
        status: 'success' as const,
      }
    : query
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
