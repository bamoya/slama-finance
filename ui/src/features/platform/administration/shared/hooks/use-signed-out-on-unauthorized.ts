import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { getGetAdminSessionQueryKey } from '../../../../../api/generated/administration/administration'
import { ApiError } from '../../../../../lib/api-error'

export const isAdminKey = (key: readonly unknown[]) =>
  typeof key[0] === 'string' && key[0].startsWith('/api/v1/admin')

/** Any 401 from an admin request means the session is gone: clear it and sign out. */
export function useSignedOutOnUnauthorized(onSignedOut: () => void) {
  const client = useQueryClient()
  useEffect(() => {
    const isUnauthorized = (error: unknown) => error instanceof ApiError && error.status === 401
    const queries = client.getQueryCache().subscribe((event) => {
      if (
        event.type === 'updated' &&
        isAdminKey(event.query.queryKey) &&
        event.query.queryKey[0] !== getGetAdminSessionQueryKey()[0] &&
        isUnauthorized(event.query.state.error)
      )
        onSignedOut()
    })
    const mutations = client.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && isUnauthorized(event.mutation.state.error)) onSignedOut()
    })
    return () => {
      queries()
      mutations()
    }
  }, [client, onSignedOut])
}
