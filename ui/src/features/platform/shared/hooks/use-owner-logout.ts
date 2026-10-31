import { useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'wouter'

import { useLogoutOwner } from '../../../../api/generated/identity/identity'
import { clearOwnerQueries } from '../api/owner-cache'

export function useOwnerLogout() {
  const mutation = useLogoutOwner()
  const client = useQueryClient()
  const [, navigate] = useLocation()
  return {
    ...mutation,
    async logout() {
      await mutation.mutateAsync()
      await clearOwnerQueries(client)
      navigate('/owner/login', { replace: true })
    },
  }
}
